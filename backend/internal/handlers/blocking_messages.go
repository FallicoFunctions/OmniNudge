package handlers

// blockingSettingsErrorMessage is returned (as HTTP 404) wherever a block
// relationship prevents an action. Using 404 — not 403 — prevents the
// blocked party from learning that a block exists.
const blockingSettingsErrorMessage = "User not found"
