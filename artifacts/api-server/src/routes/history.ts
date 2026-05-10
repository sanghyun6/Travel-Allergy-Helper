import { Router } from "express";
import { getHistoryCollection } from "../lib/mongo";

const router = Router();

function getDeviceId(req: import("express").Request): string | null {
  const header = req.header("x-device-id");
  if (header && typeof header === "string" && header.length > 0 && header.length < 200) {
    return header;
  }
  return null;
}

router.get("/history", async (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  try {
    const col = await getHistoryCollection();
    const docs = await col
      .find({ deviceId })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    res.json({
      entries: docs.map((d) => ({
        id: d.sessionId,
        savedAt: d.updatedAt.getTime(),
        menuLanguage: d.menuLanguage,
        items: d.items,
      })),
    });
  } catch (err) {
    console.error("history list error", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

router.post("/history/upsert", async (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  const { sessionId, menuLanguage, items } = req.body ?? {};
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    typeof menuLanguage !== "string" ||
    !Array.isArray(items)
  ) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  if (items.length === 0) {
    // Empty cart — delete the in-progress doc if it exists
    try {
      const col = await getHistoryCollection();
      await col.deleteOne({ sessionId, deviceId });
      res.json({ ok: true, deleted: true });
    } catch (err) {
      console.error("history delete-empty error", err);
      res.status(500).json({ error: "Failed to update history" });
    }
    return;
  }
  try {
    const col = await getHistoryCollection();
    const now = new Date();
    await col.updateOne(
      { sessionId, deviceId },
      {
        $set: {
          deviceId,
          sessionId,
          menuLanguage,
          items,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("history upsert error", err);
    res.status(500).json({ error: "Failed to save history" });
  }
});

router.delete("/history/:sessionId", async (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  try {
    const col = await getHistoryCollection();
    await col.deleteOne({ sessionId: req.params.sessionId, deviceId });
    res.json({ ok: true });
  } catch (err) {
    console.error("history delete error", err);
    res.status(500).json({ error: "Failed to delete history entry" });
  }
});

router.delete("/history", async (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  try {
    const col = await getHistoryCollection();
    await col.deleteMany({ deviceId });
    res.json({ ok: true });
  } catch (err) {
    console.error("history clear error", err);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

export default router;
