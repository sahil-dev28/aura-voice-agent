import type { NextFunction, Request, RequestHandler, Response } from "express";

export function rateLimit({ max, windowMs }: { max: number; windowMs: number }): RequestHandler {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

    if (recent.length >= max) {
      hits.set(key, recent);
      res.status(429).json({ error: "Too many calls, try again in a few minutes" });
      return;
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
