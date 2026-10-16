// Each guest's drawn character (convex/figures.ts): the full drawing and a face crop for avatars.
export const figureUrl = (key: string) => `/art/${key}.webp`;
export const faceUrl = (key: string) => `/art/faces/${key}.webp`;

/** What goes in a round avatar: their photo, else their drawing's face, else nothing (initials). */
export const avatarSrc = (photoUrl?: string | null, figure?: string | null) => photoUrl || (figure ? faceUrl(figure) : null);

/**
 * Where each drawing's face sits across its width (0 to 1), for lining the face up with the gap in the
 * jail bars (public/art/jailbars.webp). Measured from the art: the middle of the head in the top 15%.
 */
export const FACE_X: Record<string, number> = {"bodyguard": 0.455, "brayden": 0.294, "brendan": 0.374, "cameron": 0.412, "brian": 0.386, "brianna": 0.445, "holden": 0.599, "sienna": 0.323, "chrissie": 0.448, "cigarette": 0.322, "curls": 0.442, "daya": 0.334, "dapper": 0.5, "detective": 0.446, "don": 0.445, "emily": 0.387, "flapper": 0.608, "gambler": 0.403, "heiress": 0.453, "heston": 0.441, "josh": 0.415, "killer": 0.43, "lady": 0.45, "madison": 0.471, "miranda": 0.474, "owner": 0.508, "reily": 0.4, "reporter": 0.364, "sam": 0.422, "singer": 0.326, "sleuth": 0.272, "slick": 0.494, "sophia": 0.46, "sweetheart": 0.406, "trumpet": 0.495};
export const faceX = (key: string) => FACE_X[key] ?? 0.45;
