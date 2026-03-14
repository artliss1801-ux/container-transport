import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";

declare module "next-auth" {
  interface User {
    id: string;
    role: string;
    isTwoFactorEnabled: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      isTwoFactorEnabled: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    isTwoFactorEnabled: boolean;
    isTwoFactorVerified?: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        // Check 2FA if enabled
        if (user.isTwoFactorEnabled && user.twoFactorSecret) {
          if (!credentials.twoFactorCode) {
            // Return user with flag to indicate 2FA is required
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              isTwoFactorEnabled: true,
              requiresTwoFactor: true,
            } as any;
          }

          // Verify 2FA code
          const isValid = authenticator.check(
            credentials.twoFactorCode,
            user.twoFactorSecret
          );

          if (!isValid) {
            return null;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isTwoFactorEnabled: user.isTwoFactorEnabled,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.isTwoFactorEnabled = user.isTwoFactorEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.isTwoFactorEnabled = token.isTwoFactorEnabled;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      // Update last login time
      await db.user.update({
        where: { id: user.id },
        data: { updatedAt: new Date() },
      });
    },
  },
};
