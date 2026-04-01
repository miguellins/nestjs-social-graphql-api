import { MediaKind, MediaStatus, MediaType, type Prisma } from "@prisma/client";

/** Defines the safe media shape used by services. */
export type SafeMediaDTO = {
  id: number;
  kind: MediaKind;
  type: MediaType;
  status: MediaStatus;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  attachedAt: Date | null;
};

/** Defines the internal safe media record shape before public URL projection. */
export type SafeMediaRecord = Omit<SafeMediaDTO, "publicUrl">;

/** Prisma select shape for fetching safe public media fields only. */
export const SafeMediaSelect = {
  id: true,
  kind: true,
  type: true,
  status: true,
  objectKey: true,
  mimeType: true,
  bytes: true,
  width: true,
  height: true,
  durationMs: true,
  createdAt: true,
  updatedAt: true,
  attachedAt: true,
} as const satisfies Prisma.MediaSelect;
