/**
 * Who can open a note published to hyper://.
 *
 * Public goes on the "p2pmd" drive, which anyone with the link can read
 * straight from this computer. Private goes on a drive of the same name in
 * PeerSky's private store, encrypted with this profile's key, so only your own
 * linked devices can open it. The phone's Publish asks the same question, and
 * the Hyperdrive app asks for its private drives the same way.
 */
export const PUBLISH_DRIVE_NAME = "p2pmd";

export const PUBLISH_VISIBILITY_HELP = {
  public: "Public: anyone you send the link to can open it, straight from this computer.",
  private: "Private: encrypted with this profile's key, so only your own linked devices can open it.",
};

export function normalizePublishVisibility(value) {
  return value === "private" ? "private" : "public";
}

// Public keeps the request it always made, so its drive and every link
// published from it stay the same.
export function publishDriveRequestUrl(visibility) {
  const params = new URLSearchParams({ key: PUBLISH_DRIVE_NAME });
  if (normalizePublishVisibility(visibility) === "private") params.set("visibility", "private");
  return `hyper://localhost/?${params}`;
}
