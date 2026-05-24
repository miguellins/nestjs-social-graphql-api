import { z } from "zod";

export const quotePostCommandSchema = z.object({
  sourcePostId: z.number().int().positive(),
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .min(3)
    .max(50)
    .nullish(),
  content: z.string().trim().min(1, "Content cannot be empty").min(3).max(2000),
});

export type QuotePostCommand = z.infer<typeof quotePostCommandSchema>;
