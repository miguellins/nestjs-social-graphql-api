import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { HashtagsService } from "@/hashtags/hashtags.service";
import {
  classifyHashtagContentError,
  extractUniqueHashtagSlugs,
  type HashtagContentInvalidReason,
} from "@/hashtags/hashtag-parser";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { AccountState, UserPrivacySetting } from "@prisma/client";

import { PrismaService } from "@/prisma/prisma.service";

const DEFAULT_CHUNK_SIZE = 2_000;
const LIST_VERSION_KEYS = ["v:hashtags:list", "v:posts:list"] as const;

type ReconciliationMode =
  | "observe-joins"
  | "repair-joins"
  | "observe-counts"
  | "repair-counts";

type LogFormat = "json" | "text";

type HashtagBackfillOptions = {
  afterId: number;
  chunkSize: number;
  dryRun: boolean;
  limit?: number;
  logFormat: LogFormat;
  mode: ReconciliationMode;
};

type PostHashtagJoinRow = {
  hashtag: {
    slug: string;
  };
  postCreatedAt: Date;
};

type PostBackfillRow = {
  author: {
    accountState: AccountState;
    privacySetting: UserPrivacySetting;
  };
  content: string;
  createdAt: Date;
  hashtags: PostHashtagJoinRow[];
  id: number;
  removedAt: Date | null;
};

type JoinDrift = {
  actualSlugs: string[];
  expectedSlugs: string[];
  extraSlugs: string[];
  missingSlugs: string[];
  stalePostCreatedAtSlugs: string[];
};

type CountDriftRow = {
  actualPostsCount: bigint | number;
  hashtagId: number;
  slug: string;
  storedPostsCount: number;
};

type LogRecord = Record<string, boolean | number | string | string[]>;

type JoinPhaseSummary = {
  changed: number;
  drifted: number;
  invalid: number;
  processed: number;
};

type CountPhaseSummary = {
  drifted: number;
  processed: number;
  updated: number;
};

/** Runs the hashtag join and count reconciliation maintenance pipeline. */
export class HashtagBackfillReconciliationRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashtagsService: HashtagsService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  /** Dispatches the selected maintenance phase without exposing GraphQL API surface. */
  async run(options: HashtagBackfillOptions): Promise<void> {
    this.log(options, {
      dryRun: options.dryRun,
      event: "hashtag_backfill_started",
      mode: options.mode,
    });

    switch (options.mode) {
      case "observe-joins":
        await this.observeJoins(options);
        break;
      case "repair-joins":
        await this.repairJoins(options);
        break;
      case "observe-counts":
        await this.observeCounts(options);
        break;
      case "repair-counts":
        await this.repairCounts(options);
        break;
    }
  }

  /** Reports posts whose durable hashtag joins differ from parsed content. */
  private async observeJoins(options: HashtagBackfillOptions): Promise<void> {
    const summary = await this.walkPosts(options, (post) => {
      const drift = this.getJoinDriftOrLogSkip(options, post);

      if (!drift || !this.hasJoinDrift(drift)) {
        return Promise.resolve({
          changed: false,
          drifted: false,
          invalid: !drift,
        });
      }

      this.logJoinDrift(options, post.id, "join_drift_observed", drift);

      return Promise.resolve({ changed: false, drifted: true, invalid: false });
    });

    this.logJoinSummary(options, "hashtag_join_observe_completed", summary);
  }

  /** Repairs posts whose durable hashtag joins differ from parsed content. */
  private async repairJoins(options: HashtagBackfillOptions): Promise<void> {
    const summary = await this.walkPosts(options, async (post) => {
      const drift = this.getJoinDriftOrLogSkip(options, post);

      if (!drift || !this.hasJoinDrift(drift)) {
        return { changed: false, drifted: false, invalid: !drift };
      }

      this.logJoinDrift(
        options,
        post.id,
        options.dryRun ? "join_drift_repair_dry_run" : "join_drift_repaired",
        drift,
      );

      if (options.dryRun) {
        return { changed: false, drifted: true, invalid: false };
      }

      const syncResult = await this.prisma.$transaction((tx) =>
        this.hashtagsService.replacePostHashtags({
          content: post.content,
          postCreatedAt: post.createdAt,
          postId: post.id,
          publiclyCountable: this.hashtagsService.isPubliclyCountablePost({
            removedAt: post.removedAt,
            author: post.author,
          }),
          tx,
        }),
      );

      return {
        changed: syncResult.changed,
        drifted: true,
        invalid: false,
      };
    });

    if (!options.dryRun) {
      await this.bumpListVersions(options);
    }

    this.logJoinSummary(options, "hashtag_join_repair_completed", summary);
  }

  /** Reports hashtags whose stored public post count differs from aggregate truth. */
  private async observeCounts(options: HashtagBackfillOptions): Promise<void> {
    const summary = await this.walkCountDrifts(options, (row) => {
      this.logCountDrift(options, "count_drift_observed", row);
      return Promise.resolve(false);
    });

    this.logCountSummary(options, "hashtag_count_observe_completed", summary);
  }

  /** Rewrites hashtag public post counts from aggregate truth. */
  private async repairCounts(options: HashtagBackfillOptions): Promise<void> {
    const summary = await this.walkCountDrifts(options, async (row) => {
      this.logCountDrift(
        options,
        options.dryRun ? "count_drift_repair_dry_run" : "count_drift_repaired",
        row,
      );

      if (options.dryRun) {
        return false;
      }

      await this.prisma.hashtag.updateMany({
        where: { id: row.hashtagId },
        data: { postsCount: Number(row.actualPostsCount) },
      });

      return true;
    });

    if (!options.dryRun) {
      await this.bumpListVersions(options);
    }

    this.logCountSummary(options, "hashtag_count_repair_completed", summary);
  }

  /** Walks posts by ascending id so canary ranges can be widened safely. */
  private async walkPosts(
    options: HashtagBackfillOptions,
    handlePost: (post: PostBackfillRow) => Promise<{
      changed: boolean;
      drifted: boolean;
      invalid: boolean;
    }>,
  ): Promise<JoinPhaseSummary> {
    let lastId = options.afterId;
    const summary: JoinPhaseSummary = {
      changed: 0,
      drifted: 0,
      invalid: 0,
      processed: 0,
    };

    while (!this.reachedLimit(options, summary.processed)) {
      const remaining = this.remainingLimit(options, summary.processed);
      const take = Math.min(options.chunkSize, remaining ?? options.chunkSize);
      const posts = await this.findPostChunk(lastId, take);

      if (posts.length === 0) {
        break;
      }

      for (const post of posts) {
        const result = await handlePost(post);

        summary.processed += 1;
        if (result.changed) summary.changed += 1;
        if (result.drifted) summary.drifted += 1;
        if (result.invalid) summary.invalid += 1;
        lastId = post.id;
      }

      if (options.mode === "repair-joins" && !options.dryRun) {
        await this.bumpListVersions(options);
      }
    }

    return summary;
  }

  /** Walks count drift rows in ascending hashtag id order. */
  private async walkCountDrifts(
    options: HashtagBackfillOptions,
    handleDrift: (row: CountDriftRow) => Promise<boolean>,
  ): Promise<CountPhaseSummary> {
    let lastId = options.afterId;
    const summary: CountPhaseSummary = {
      drifted: 0,
      processed: 0,
      updated: 0,
    };

    while (!this.reachedLimit(options, summary.processed)) {
      const remaining = this.remainingLimit(options, summary.processed);
      const take = Math.min(options.chunkSize, remaining ?? options.chunkSize);
      const rows = await this.findCountDriftChunk(lastId, take);

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const updated = await handleDrift(row);

        summary.processed += 1;
        summary.drifted += 1;
        if (updated) summary.updated += 1;
        lastId = row.hashtagId;
      }

      if (options.mode === "repair-counts" && !options.dryRun) {
        await this.bumpListVersions(options);
      }
    }

    return summary;
  }

  /** Loads one deterministic chunk of posts and their current hashtag joins. */
  private async findPostChunk(
    afterId: number,
    take: number,
  ): Promise<PostBackfillRow[]> {
    return this.prisma.post.findMany({
      take,
      where: {
        id: {
          gt: afterId,
        },
      },
      orderBy: {
        id: "asc",
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        removedAt: true,
        author: {
          select: {
            accountState: true,
            privacySetting: true,
          },
        },
        hashtags: {
          select: {
            postCreatedAt: true,
            hashtag: {
              select: {
                slug: true,
              },
            },
          },
          orderBy: {
            hashtag: {
              slug: "asc",
            },
          },
        },
      },
    });
  }

  /** Finds hashtag count drift using the same anonymous-public predicate as the service helper. */
  private async findCountDriftChunk(
    afterId: number,
    take: number,
  ): Promise<CountDriftRow[]> {
    return this.prisma.$queryRaw<CountDriftRow[]>`
      SELECT
        h.id AS hashtagId,
        h.slug AS slug,
        h.postsCount AS storedPostsCount,
        COALESCE(c.publicPostsCount, 0) AS actualPostsCount
      FROM \`Hashtag\` h
      LEFT JOIN (
        SELECT ph.hashtagId, COUNT(*) AS publicPostsCount
        FROM \`PostHashtag\` ph
        INNER JOIN \`Post\` p ON p.id = ph.postId
        INNER JOIN \`User\` u ON u.id = p.authorId
        WHERE p.removedAt IS NULL
          AND u.privacySetting = ${UserPrivacySetting.PUBLIC}
          AND u.accountState <> ${AccountState.DEACTIVATED}
        GROUP BY ph.hashtagId
      ) c ON c.hashtagId = h.id
      WHERE h.id > ${afterId}
        AND h.postsCount <> COALESCE(c.publicPostsCount, 0)
      ORDER BY h.id ASC
      LIMIT ${take}
    `;
  }

  /** Parses expected slugs or logs a redacted invalid-content skip record. */
  private getJoinDriftOrLogSkip(
    options: HashtagBackfillOptions,
    post: PostBackfillRow,
  ): JoinDrift | null {
    try {
      return this.getJoinDrift(post, extractUniqueHashtagSlugs(post.content));
    } catch (error) {
      const reason = classifyHashtagContentError(error);

      this.logSkippedInvalidContent(options, post.id, reason);

      return null;
    }
  }

  /** Compares parsed slug truth to current join slugs and join timestamps. */
  private getJoinDrift(
    post: PostBackfillRow,
    expectedSlugs: string[],
  ): JoinDrift {
    const actualSlugs = [
      ...new Set(post.hashtags.map((row) => row.hashtag.slug)),
    ].sort();
    const expectedSlugSet = new Set(expectedSlugs);
    const actualSlugSet = new Set(actualSlugs);
    const missingSlugs = expectedSlugs.filter(
      (slug) => !actualSlugSet.has(slug),
    );
    const extraSlugs = actualSlugs.filter((slug) => !expectedSlugSet.has(slug));
    const stalePostCreatedAtSlugs = post.hashtags
      .filter(
        (row) =>
          expectedSlugSet.has(row.hashtag.slug) &&
          row.postCreatedAt.getTime() !== post.createdAt.getTime(),
      )
      .map((row) => row.hashtag.slug)
      .sort();

    return {
      actualSlugs,
      expectedSlugs,
      extraSlugs,
      missingSlugs,
      stalePostCreatedAtSlugs,
    };
  }

  /** Returns true when slug membership or join timestamps differ from expected truth. */
  private hasJoinDrift(drift: JoinDrift): boolean {
    return (
      drift.missingSlugs.length > 0 ||
      drift.extraSlugs.length > 0 ||
      drift.stalePostCreatedAtSlugs.length > 0
    );
  }

  /** Invalidates hashtag search and hashtag post-list cache groups after write chunks. */
  private async bumpListVersions(
    options: HashtagBackfillOptions,
  ): Promise<void> {
    for (const versionKey of LIST_VERSION_KEYS) {
      await this.cacheHelper.bumpVersion(versionKey);
      this.log(options, {
        event: "cache_version_bumped",
        versionKey,
      });
    }
  }

  /** Logs a redacted invalid-content skip record for one historical post. */
  private logSkippedInvalidContent(
    options: HashtagBackfillOptions,
    postId: number,
    reason: HashtagContentInvalidReason,
  ): void {
    this.log(options, {
      classification: "skipped_invalid_content",
      event: "post_skipped",
      postId,
      reason,
    });
  }

  /** Logs one join drift record without raw post content. */
  private logJoinDrift(
    options: HashtagBackfillOptions,
    postId: number,
    event: string,
    drift: JoinDrift,
  ): void {
    this.log(options, {
      actualSlugs: drift.actualSlugs,
      event,
      expectedSlugs: drift.expectedSlugs,
      extraSlugs: drift.extraSlugs,
      missingSlugs: drift.missingSlugs,
      postId,
      stalePostCreatedAtSlugs: drift.stalePostCreatedAtSlugs,
    });
  }

  /** Logs one count drift record with stored and aggregate values. */
  private logCountDrift(
    options: HashtagBackfillOptions,
    event: string,
    row: CountDriftRow,
  ): void {
    this.log(options, {
      actualPostsCount: Number(row.actualPostsCount),
      event,
      hashtagId: row.hashtagId,
      slug: row.slug,
      storedPostsCount: row.storedPostsCount,
    });
  }

  /** Logs the final join-phase summary. */
  private logJoinSummary(
    options: HashtagBackfillOptions,
    event: string,
    summary: JoinPhaseSummary,
  ): void {
    this.log(options, {
      changed: summary.changed,
      drifted: summary.drifted,
      event,
      invalid: summary.invalid,
      processed: summary.processed,
    });
  }

  /** Logs the final count-phase summary. */
  private logCountSummary(
    options: HashtagBackfillOptions,
    event: string,
    summary: CountPhaseSummary,
  ): void {
    this.log(options, {
      drifted: summary.drifted,
      event,
      processed: summary.processed,
      updated: summary.updated,
    });
  }

  /** Emits one structured log record as JSON or compact text. */
  private log(options: HashtagBackfillOptions, record: LogRecord): void {
    const payload = {
      ...record,
      dryRun: options.dryRun,
      mode: options.mode,
    };

    if (options.logFormat === "json") {
      console.log(JSON.stringify(payload));
      return;
    }

    const fields = Object.entries(payload)
      .map(
        ([key, value]) =>
          `${key}=${Array.isArray(value) ? value.join(",") : value}`,
      )
      .join(" ");

    console.log(fields);
  }

  /** Returns true when a limited run has consumed its requested row count. */
  private reachedLimit(
    options: HashtagBackfillOptions,
    processed: number,
  ): boolean {
    return options.limit !== undefined && processed >= options.limit;
  }

  /** Returns remaining requested rows for a limited run. */
  private remainingLimit(
    options: HashtagBackfillOptions,
    processed: number,
  ): number | undefined {
    return options.limit === undefined ? undefined : options.limit - processed;
  }
}

/** Parses CLI flags for the hashtag reconciliation maintenance script. */
export function parseHashtagBackfillArgs(
  argv: string[],
): HashtagBackfillOptions {
  const flags = parseFlags(argv);
  const mode = parseMode(requireValue(flags, "mode"));

  return {
    afterId: parseNonNegativeInteger(flags["after-id"] ?? "0", "after-id"),
    chunkSize: parsePositiveInteger(
      flags["chunk-size"] ?? String(DEFAULT_CHUNK_SIZE),
      "chunk-size",
    ),
    dryRun: flags.apply !== "true",
    limit:
      flags.limit === undefined
        ? undefined
        : parsePositiveInteger(flags.limit, "limit"),
    logFormat: parseLogFormat(flags["log-format"] ?? "text"),
    mode,
  };
}

/** Creates an application context, runs the selected phase, and closes providers. */
async function bootstrapHashtagBackfillReconciliation(): Promise<void> {
  process.env.METRICS_ENABLED = "false";
  process.env.OUTBOX_PROCESS_ROLE = process.env.OUTBOX_PROCESS_ROLE ?? "api";

  const { AppModule } = await import("../app.module.js");
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  try {
    const runner = createRunner(app);
    await runner.run(parseHashtagBackfillArgs(process.argv.slice(2)));
  } finally {
    await app.close();
  }
}

/** Resolves the required providers from the Nest application context. */
function createRunner(
  app: INestApplicationContext,
): HashtagBackfillReconciliationRunner {
  return new HashtagBackfillReconciliationRunner(
    app.get(PrismaService, { strict: false }),
    app.get(HashtagsService, { strict: false }),
    app.get(CacheHelperService, { strict: false }),
  );
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      flags.apply = "false";
      continue;
    }

    if (arg === "--apply") {
      flags.apply = "true";
      continue;
    }

    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    const nextValue = inlineValue ?? argv[i + 1];

    if (!rawName || !nextValue || nextValue.startsWith("--")) {
      throw new Error(`Missing value for --${rawName}`);
    }

    flags[rawName] = nextValue;

    if (inlineValue === undefined) {
      i += 1;
    }
  }

  return flags;
}

function requireValue(flags: Record<string, string>, name: string): string {
  const value = flags[name];

  if (!value) {
    throw new Error(`Missing required --${name}`);
  }

  return value;
}

function parseMode(value: string): ReconciliationMode {
  if (
    value === "observe-joins" ||
    value === "repair-joins" ||
    value === "observe-counts" ||
    value === "repair-counts"
  ) {
    return value;
  }

  throw new Error(
    "Invalid --mode. Expected observe-joins, repair-joins, observe-counts, or repair-counts",
  );
}

function parseLogFormat(value: string): LogFormat {
  if (value === "json" || value === "text") {
    return value;
  }

  throw new Error("Invalid --log-format. Expected json or text");
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }

  return parsed;
}

if (require.main === module) {
  bootstrapHashtagBackfillReconciliation().catch((error: unknown) => {
    console.error("Error during hashtag backfill reconciliation:", error);
    process.exit(1);
  });
}
