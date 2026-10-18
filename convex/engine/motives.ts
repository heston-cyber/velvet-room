// Every guest's motive (Oct 18, Heston: "at the roll call each persons motive is read aloud for everyone to hear").
// The game writes them all: "you" goes on the guest's phone, "they" is read out at the roll call. A game deals them
// without repeats (18 a script, so a full house of 16 never shares one). Sailor mode reads the Adult ones.
export type Motive = { you: string; they: string };

export const MOTIVES_CLASSIC: Motive[] = [
  { you: "The Don owed you a small fortune and laughed when you asked for it.", they: "The Don owed them a small fortune and laughed when they asked for it." },
  { you: "He caught you skimming from the till and promised you'd regret it.", they: "He caught them skimming from the till and promised they'd regret it." },
  { you: "He threatened to tell everyone what you're really hiding.", they: "He threatened to tell everyone what they're really hiding." },
  { you: "He fired your sweetheart from the band last week, in front of everyone.", they: "He fired their sweetheart from the band last week, in front of everyone." },
  { you: "You lost your car to him in a card game, and you're sure he cheated.", they: "They lost their car to him in a card game, and they're sure he cheated." },
  { you: "He cut you out of a deal you'd spent a year setting up.", they: "He cut them out of a deal they'd spent a year setting up." },
  { you: "He knew about your past in Detroit and never let you forget it.", they: "He knew about their past in Detroit and never let them forget it." },
  { you: "He promised you a cut of the bootleg money and never paid.", they: "He promised them a cut of the bootleg money and never paid." },
  { you: "He was about to marry the person you love.", they: "He was about to marry the person they love." },
  { you: "He sold your favorite booth to a rival, just to spite you.", they: "He sold their favorite booth to a rival, just to spite them." },
  { you: "He called you a two-bit nobody in front of the whole room.", they: "He called them a two-bit nobody in front of the whole room." },
  { you: "He was holding your family's watch as collateral and wouldn't give it back.", they: "He was holding their family's watch as collateral and wouldn't give it back." },
  { you: "He framed your brother for a job he pulled himself.", they: "He framed their brother for a job he pulled himself." },
  { you: "He was going to shut down the business you run out of the back.", they: "He was going to shut down the business they run out of the back." },
  { you: "He crossed your name out of his will, in red ink, at a party.", they: "He crossed their name out of his will, in red ink, at a party." },
  { you: "He bought the building you live in and doubled the rent.", they: "He bought the building they live in and doubled the rent." },
  { you: "He got you thrown out of the Cotton Club, and you can't prove it.", they: "He got them thrown out of the Cotton Club, and they can't prove it." },
  { you: "He stole your recipe for gin and sold it as his own.", they: "He stole their recipe for gin and sold it as his own." },
];

export const MOTIVES_ADULT: Motive[] = [
  { you: "The Don owed you a fortune and laughed in your face when you asked for it. Then he farted. On purpose.", they: "The Don owed them a fortune and laughed in their face when they asked for it. Then he farted. On purpose." },
  { you: "He caught you skimming from the till and swore he'd break your kneecaps, left one first.", they: "He caught them skimming from the till and swore he'd break their kneecaps, left one first." },
  { you: "He told everyone what you keep in your coat pocket, and now nobody will shake your hand.", they: "He told everyone what they keep in their coat pocket, and now nobody will shake their hand." },
  { you: "He fired your sweetheart from the band for sounding like a cat in a blender. Rude. Accurate, but rude.", they: "He fired their sweetheart from the band for sounding like a cat in a blender. Rude. Accurate, but rude." },
  { you: "You lost your car to him in a card game, and that cheating crook had aces up both sleeves.", they: "They lost their car to him in a card game, and that cheating crook had aces up both sleeves." },
  { you: "He cut you out of a deal you'd busted your ass on for a year.", they: "He cut them out of a deal they'd busted their ass on for a year." },
  { you: "He knew what you did in Detroit, and he wouldn't shut the hell up about it.", they: "He knew what they did in Detroit, and he wouldn't shut the hell up about it." },
  { you: "He promised you a cut of the bootleg money and paid you in IOUs and bad advice.", they: "He promised them a cut of the bootleg money and paid them in IOUs and bad advice." },
  { you: "He was about to marry the person you've been in love with for years. The rat.", they: "He was about to marry the person they've been in love with for years. The rat." },
  { you: "He gave your favorite booth to a rival and spat in your potted plant.", they: "He gave their favorite booth to a rival and spat in their potted plant." },
  { you: "He called you a two-bit nobody in front of the whole damn room. Twice.", they: "He called them a two-bit nobody in front of the whole damn room. Twice." },
  { you: "He was holding your granddad's watch as collateral and wearing it just to rub it in.", they: "He was holding their granddad's watch as collateral and wearing it just to rub it in." },
  { you: "He framed your brother for a job he pulled himself. Your brother's still in the can.", they: "He framed their brother for a job he pulled himself. The brother's still in the can." },
  { you: "He was going to shut down the hustle you run out of the back, and that hustle pays your rent.", they: "He was going to shut down the hustle they run out of the back, and that hustle pays their rent." },
  { you: "He sold your dog to a circus. The dog is happier. That's not the point.", they: "He sold their dog to a circus. The dog is happier. That's not the point." },
  { you: "He bought the building you live in and doubled the rent, the greedy jackass.", they: "He bought the building they live in and doubled the rent, the greedy jackass." },
  { you: "He told the whole club you cry at the pictures. You do. Still none of his damn business.", they: "He told the whole club they cry at the pictures. They do. Still none of his damn business." },
  { you: "He stole your recipe for bathtub gin and called it his own. It's the only thing you're good at.", they: "He stole their recipe for bathtub gin and called it his own. It's the only thing they're good at." },
];
