// Each guest's drawn character (convex/figures.ts): the full drawing and a face crop for avatars.
export const figureUrl = (key: string) => `/art/${key}.webp`;
export const faceUrl = (key: string) => `/art/faces/${key}.webp`;

/** What goes in a round avatar: their photo, else their drawing's face, else nothing (initials). */
export const avatarSrc = (photoUrl?: string | null, figure?: string | null) => photoUrl || (figure ? faceUrl(figure) : null);
