import { ObjectId } from "mongodb";
import { z } from "zod";

export const objectIdInput = z
  .string()
  .min(1)
  .refine((value) => ObjectId.isValid(value), "Invalid id")
  .transform((value) => new ObjectId(value));
