import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID,
  qbittorrentTransferConfigSchema,
  qbittorrentTransferContract,
} from "./qbittorrent-transfer";

describe("qbittorrent-transfer widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(qbittorrentTransferContract.publicSafe).toBe(false);
    expect(qbittorrentTransferContract.id).toBe("qbittorrent-transfer");
    assertWidgetContract(qbittorrentTransferContract);
    expect(
      qbittorrentTransferConfigSchema.parse(qbittorrentTransferContract.defaultConfig),
    ).toEqual({
      integrationId: QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID,
    });
  });
});
