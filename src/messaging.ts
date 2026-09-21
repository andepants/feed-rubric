import {
  isAllowedClassifyOrigin,
  isExtensionPageUrl,
  isFixtureOrigin,
  originOf,
} from "./origins.js";

export interface MessageSenderLike {
  id?: string;
  url?: string;
  origin?: string;
}

export function classifySenderOrigin(sender: MessageSenderLike): string | null {
  return originOf(sender.url) ?? (sender.origin ? originOf(sender.origin) : null);
}

export function isTrustedClassifySender(
  sender: MessageSenderLike,
  extensionId: string,
): boolean {
  if (sender.id && sender.id !== extensionId) return false;
  return isAllowedClassifyOrigin(classifySenderOrigin(sender));
}

export function isFixtureSender(sender: MessageSenderLike): boolean {
  return isFixtureOrigin(classifySenderOrigin(sender));
}

export function isExtensionPageSender(
  sender: MessageSenderLike,
  extensionId: string,
): boolean {
  if (sender.id && sender.id !== extensionId) return false;
  return isExtensionPageUrl(sender.url, extensionId);
}
