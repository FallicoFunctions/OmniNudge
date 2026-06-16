package models

const DeletedCommentPlaceholder = "[DELETED]"

// BlockedCommentPlaceholder replaces the body and username of a comment
// whose author has blocked the viewer. Children are preserved so the
// thread structure remains intact.
const BlockedCommentPlaceholder = "[removed]"
