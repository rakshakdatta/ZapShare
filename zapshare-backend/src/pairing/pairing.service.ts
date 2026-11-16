export interface PeerEntry {
  peerId: string;
  deviceName: string;
  ip: string; // ✅ IP address of the peer
  expiresAt: number; // ✅ Expiry for auto-cleanup (in ms)
}

export class PairingService {
  // In-memory storage: code → PeerEntry
  private pairMap = new Map<string, PeerEntry>();

  // ✅ Register a peer under a pairing code
  register(code: string, peerId: string, deviceName: string, ip: string) {
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL
    this.pairMap.set(code, { peerId, deviceName, ip, expiresAt });
    console.log(`📝 Registered: [${code}] → ${peerId} (${deviceName} @ ${ip})`);
  }

  // ✅ List all active peers (used on /send page for LAN discovery)
  getActivePeers(): Array<{
    code: string;
    peerId: string;
    deviceName: string;
    ip: string;
  }> {
    const now = Date.now();
    return Array.from(this.pairMap.entries())
      .filter(([, entry]) => entry.expiresAt > now)
      .map(([code, entry]) => ({
        code,
        peerId: entry.peerId,
        deviceName: entry.deviceName,
        ip: entry.ip,
      }));
  }

  // ✅ Get a peer by its short code (used before file-offer)
  getPeerByCode(code: string): PeerEntry | undefined {
    const entry = this.pairMap.get(code);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      this.pairMap.delete(code); // auto-cleanup expired entries
      console.warn(`⏳ Expired pairing removed for code: ${code}`);
      return undefined;
    }

    return entry;
  }

  // ✅ Validate that code matches receiver's peerId
  validatePairing(to: string, code: string): boolean {
    const entry = this.pairMap.get(code);
    const isValid =
      !!entry && entry.peerId === to && entry.expiresAt > Date.now();

    console.log(
      isValid
        ? `✅ Verified pairing ${code} for ${to}`
        : `❌ Pair verification failed for ${code} → ${to}`,
    );

    return isValid;
  }
}
