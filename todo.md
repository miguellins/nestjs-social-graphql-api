# TO COMPARE BRANCHES IN THE CURSOR:
via the Source Control icon - better
via the GitLens Inspect


# AFTER EVERYTHING IS DONE:
- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- UPDATE THE .GITIGNORE FILE


//---//---//---// //---//---//---//


# NEXT FEATURE

Missing for a realistic MVP:
- User avatar/profile photo.
- Bio and profile metadata.
- Real pagination.
- Basic report/block.
- Email verification.
- Session revocation.
- Notification preferences.

# Per Module

Notifications
- Only two notification types.
- `entityId` is polymorphic but weakly typed.
- Delivery is only DB row + in-memory pubsub.


//---//---//---// //---//---//---//


# TO FIX:











# QUESTIONS ABOUT THE NEW FEATURE:





Make sure all post related fields are updated to the new fields. DONT MAKE THE CHANGES IN MIGRATIONS, only in prisma schema, and following the project pattern. Return ALL GRAPHQL OPERATIONS THAT WAS AFFECTED.




# The Problem:

Improvements in Models (Tables)

Change by Models:



//---//---//---// //---//---//---//


I want to make improvements in the Post, create a plan for each "problem" (marked with ##), i want to implement one problema at once. Carefully. Return this list in the exact best order for implementation. Example: Return Change content at 200 characters in create-post.input.ts if that is the best first implementation to be made. I want a plan for each problem (marked with ##).

# Post:

TO FIX:

## Post Search is simplistic
It means your current post search is just a basic database text filter, not a real search system.

In this project, `posts.service.ts` does this:
- trims/lowercases `q`
- runs Prisma `findMany`
- uses `contains` on `title` and `content`

That is simple substring matching.

Why that is “simplistic”:
- no relevance ranking
  - results are not ordered by best match, only by `createdAt`
- no stemming / morphology
  - searching `run` may not match `running` the way users expect
- no typo tolerance
  - `javascript` will not behave like `javascript`
- no tokenization intelligence
  - phrases, word boundaries, and language behavior are limited
- weak scalability for larger datasets
  - `%contains%` style matching becomes less attractive as data grows
- limited indexing benefit
  - normal indexes do not help much for arbitrary substring search

What “fulltext strategy” means:
- using database-native full-text search features
- for MySQL, typically FULLTEXT indexes plus `MATCH ... AGAINST`
- gives better relevance and better performance than naive `contains`

Check if this is worth it and "real world social media" and check whats the best option. Focusing in production ready and real world alike projects
What “external search” means:
- using a dedicated search engine/service such as:
  - Elasticsearch / OpenSearch
  - Meilisearch
  - Algolia
  - Typesense
- useful when you need:
  - relevance ranking
  - typo tolerance
  - filters + facets
  - autocomplete
  - scalable search UX

So the statement means:
- your current search is fine for a small MVP
- but if search becomes an important product feature, this implementation is not enough long-term

In short:
- current search = simple text filtering
- fulltext search = better database-backed search
- external search = full-featured production search system


## Post is too minimal for a realistic product

It means the current `Post` entity is too minimal for a realistic product.

Right now a post is basically:
- `title`
- `content`

That is enough for CRUD practice, but not enough for a more realistic social/content model.

Why it is considered weak:
- many social posts do not naturally need a title
- all posts being forced into `title + content` is artificial UX
- it limits content types and product evolution
- it does not model common post metadata

A “better post model” usually means adding or rethinking fields such as:
- optional title instead of required title
- body/content designed for short-form vs long-form use
- image/media support
- post type
  - text
  - image
  - link
  - repost
- visibility/privacy
- edited state
- tags/categories
- slug/permalink behavior if needed
- publish/draft/scheduled state

So the phrase means:
- the current schema works technically
- but it is still an MVP/training-level content model
- a more realistic app would likely move beyond “every post must have a title and content”


## Change content at 200 characters in create-post.input.ts
Simple edit



//---//---//---// //---//---//---//

# ADD PHOTO AND VIDEOS

To build this in a "real-world" way without a frontend, you will use your Backend as the orchestrator and Postman/Insomnia as the client.

Since you are using NestJS (Code First), Prisma, and MySQL, here is the professional blueprint for handling media.

1. The Strategy: The "Direct-to-S3" Presigned URL
In a real-world production environment (like Netflix or Instagram), the server never "touches" the video bytes. It only handles the permissions.
The Workflow:
 * Mutation 1 (Request): You tell NestJS: "I want to upload my-video.mp4."
 * NestJS: Generates a Presigned URL from AWS S3 and returns it to you.
 * Client (Postman): You perform a PUT request directly to that S3 URL with your file.
 * Mutation 2 (Confirm): You tell NestJS: "The upload is done, here is the file ID." NestJS then saves the metadata to MySQL via Prisma.

2. The Tools
 * Storage: AWS S3 (Industry standard) or Cloudflare R2 (Cheaper/No egress fees).
 * Database: MySQL (via Prisma) to store the url, file_size, and mime_type.
 * Processing (Optional but Pro): AWS Lambda to automatically create thumbnails for videos once they hit the bucket.
Are they paid?
 * AWS S3: Has a Free Tier for 12 months (5GB storage, 20,000 Get Requests, 2,000 Put Requests). For a learning project, you will likely pay $0.00.
 * Cloudflare R2: Has a generous free tier (10GB) and doesn't require a credit card as strictly as AWS sometimes does.

3. Level of Difficulty: Medium (7/10)
It is harder than saving a file to a local folder, but it is the "Senior Developer" way to do it.
 * Challenges: Configuring AWS IAM roles/permissions, handling CORS (even without a frontend, S3 needs to know who can 'PUT' data), and managing the asynchronous nature of cloud storage.

4. Implementation Guide (Code-First)

Step A: The Prisma Schema
Don't store the video; store the reference.
model Media {
  id        String   @id @default(uuid())
  filename  String
  url       String   // The permanent S3 link
  bucketKey String   // The path inside S3
  type      String   // e.g., "video/mp4" or "image/jpeg"
  createdAt DateTime @default(now())
}

Step B: The GraphQL Resolver
You need two mutations to mimic the real-world flow.
@Resolver()
export class MediaResolver {
  constructor(private readonly s3Service: S3Service) {}

  // 1. Get the permission to upload
  @Mutation(() => String)
  async getPresignedUploadUrl(
    @Args('filename') filename: string,
    @Args('fileType') fileType: string,
  ) {
    return this.s3Service.createUploadUrl(filename, fileType);
  }

  // 2. Save to MySQL after Postman upload is successful
  @Mutation(() => Media)
  async confirmMediaUpload(
    @Args('input') input: CreateMediaInput,
  ) {
    return this.prisma.media.create({ data: input });
  }
}

Step C: The S3 Service (Logic)
You will use the @aws-sdk/s3-request-presigner to create the link.
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private client = new S3Client({ region: 'us-east-1' });

  async createUploadUrl(key: string, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: 'your-production-bucket',
      Key: key,
      ContentType: contentType,
    });
    
    // This URL expires in 5 minutes
    return getSignedUrl(this.client, command, { expiresIn: 300 });
  }
}

5. How to practice this without a Frontend
 * Open Apollo Sandbox: Call getPresignedUploadUrl. Copy the returned URL.
 * Open Postman: * Method: PUT
   * URL: Paste the copied URL.
   * Headers: Set Content-Type to match what you sent in the mutation (e.g., video/mp4).
   * Body: Select binary and upload your video.
 * Check AWS Console: See your file sitting in the bucket!
 * Finalize: Call confirmMediaUpload in GraphQL to save the record to your MySQL database.







# ABOUT THE NEW IMPLEMENTATION:



## IMPROVE ALL MODELS













//---//---//---// //---//---//---//
