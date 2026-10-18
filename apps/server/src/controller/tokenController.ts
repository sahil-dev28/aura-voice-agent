import type { Request, Response } from "express";

import { env } from "@aura/env/server";

import { getGenAI, liveConnectConfig } from "@/utils/gemini";

const TOKEN_TTL_MS = 30 * 60_000;
const NEW_SESSION_TTL_MS = 60_000;

export const createToken = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
    const token = await getGenAI().authTokens.create({
      config: {
        uses: 1,
        expireTime: expiresAt,
        newSessionExpireTime: new Date(now.getTime() + NEW_SESSION_TTL_MS).toISOString(),
        liveConnectConstraints: { model: env.GEMINI_LIVE_MODEL, config: liveConnectConfig(now) },
      },
    });
    if (!token.name) throw new Error("Token response had no name");

    res.status(200).json({ data: { token: token.name, model: env.GEMINI_LIVE_MODEL, expiresAt } });
    return;
  } catch (error) {
    console.error("Token creation failed:", error);
    res.status(500).json({ error: "Could not start call" });
  }
};
