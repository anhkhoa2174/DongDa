import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  usernameOrEmail: z
    .string()
    .min(1, 'Nhập username hoặc email'),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
