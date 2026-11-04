import { schema, types, VALIDATION_LEVEL } from "papr";

import { papr } from "../papr.ts";

export const userSchema = schema(
  {
    createdAt: types.date({ required: true }),
    email: types.string({ required: true }),
    emailVerified: types.boolean({ required: true }),
    image: types.string(),
    name: types.string({ required: true }),
    updatedAt: types.date({ required: true }),
  },
  { validationLevel: VALIDATION_LEVEL.OFF }
);

export type UserDocument = (typeof userSchema)[0];

export const User = papr.model("user", userSchema);
