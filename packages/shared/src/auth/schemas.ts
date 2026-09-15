import { z } from 'zod';

const emailSchema = z.string().min(1, 'Email is required').email('Enter a valid email address');
const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .max(128, 'Password must be fewer than 128 characters');
const displayNameSchema = z
  .string()
  .min(2, 'Name must include at least 2 characters')
  .max(80, 'Name must be fewer than 80 characters');

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  remember: z.boolean().optional().default(true),
});

export const signUpSchema = signInSchema
  .extend({
    confirmPassword: passwordSchema,
    displayName: displayNameSchema,
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        path: ['confirmPassword'],
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
      });
    }
  });

export const passwordResetSchema = z.object({
  email: emailSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type PasswordResetValues = z.infer<typeof passwordResetSchema>;
export type VerificationValues = z.infer<typeof resendVerificationSchema>;
