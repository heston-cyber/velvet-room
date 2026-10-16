// The Adult script: same logic, same facts in every clue, filthier mouth.
// Chosen per game in the game menu. Crude and profane, never hateful.
import { list, mid, q, theList, type Script } from "./text";

export const ADULT: Script = {
  suspectClear: (say, n) =>
    say("s1", [
      `${n} was locked in the can for twenty goddamn minutes. Three people in line heard every second of it. Cleared, and frankly, get that checked.`,
      `A flash photo shows ${n} shit-faced and slow dancing with a coat rack at the very moment the Don went quiet. Cleared.`,
      `${n} spent the whole time getting their ass handed to them at cards. Five smug bastards vouch for it. Cleared.`,
      `The bandleader says ${n} was screaming the wrong words to every damn song. Too busy embarrassing themselves to kill anybody. Cleared.`,
      `${n} was out back puking in the bushes the whole time. The doorman held their hair. Cleared.`,
    ]),
  suspectPairClear: (say, a, b) =>
    say("s2", [
      `${a} and ${b} spent the whole night screaming at each other over a goddamn bar tab. They alibi each other, sadly. Both cleared.`,
      `${a} and ${b} were out back sharing a cigar and talking shit about the Don's toupee when it happened. Both cleared.`,
      `The bartender swears ${a} and ${b} never left the bar. He'd know, because neither cheap bastard tipped. Both cleared.`,
    ]),
  suspectTrioClear: (say, a, b, c) =>
    say("s3", [
      `${a}, ${b} and ${c} were at the craps table losing their asses the whole damn time. The dealer's sick of all three of them. All cleared.`,
      `${a}, ${b} and ${c} are in the photographer's group shot from the exact minute the Don died, all three blinking like idiots. All cleared.`,
      `The band watched ${a}, ${b} and ${c} butcher the Charleston right through it. Nobody who dances that badly has time to kill. All three cleared.`,
    ]),
  witness: (say, sex, cleared) =>
    say("w", [
      sex === "m"
        ? `The coat-check girl saw the killer sneak out the side door: a man, hat pulled down like a goddamn cartoon villain. That clears ${list(cleared)}.`
        : `The coat-check girl saw the killer sneak out the side door: a woman in a long coat, cool as hell. That clears ${list(cleared)}.`,
      sex === "m"
        ? `A drunk in the alley heard a man chewing the Don out, then a thud, then nothing. The killer's a man, so ${list(cleared)} are off the hook.`
        : `A drunk in the alley heard a woman chewing the Don out, then a thud, then nothing. The killer's a woman, so ${list(cleared)} are off the hook.`,
      sex === "m"
        ? `Footprints in the spilled gin lead away from the body: a man's size twelves. That clears ${list(cleared)}, and somebody owes the club a mop.`
        : `Footprints in the spilled gin lead away from the body: a woman's heels. That clears ${list(cleared)}, and somebody owes the club a mop.`,
    ]),
  coroner: (say, kind, positive, weapons) => {
    const out = `That rules out ${theList(weapons)}.`;
    if (positive)
      return {
        blunt: `The coroner's report: somebody caved the Don's head in with something heavy. ${out}`,
        blade: `The coroner's report: one deep, clean cut. Something sharp as hell did this. ${out}`,
        gun: `The coroner's report: he dug a bullet out of the Don's fat ass. Somebody shot him. ${out}`,
        cord: `The coroner's report: marks around the Don's neck. Some bastard strangled him. ${out}`,
        other: `The coroner's report: not a cut, not a bruise, not a damn bullet hole on him. ${out}`,
      }[kind];
    return say(`c-${kind}`, [
      {
        blunt: `The coroner's report: not one bruise on the Don, which for him is a personal record. Nothing heavy was used. ${out}`,
        blade: `The coroner's report: not a single cut on the Don. Not even a shaving nick. ${out}`,
        gun: `The coroner's report: no bullet, and nobody heard a shot all damn night. ${out}`,
        cord: `The coroner's report: the Don's neck is clean. First time for everything. ${out}`,
        other: `The coroner's report: no poison in his blood, no water in his lungs. Just gin. So much gin. ${out}`,
      }[kind],
    ]);
  },
  exhibitClear: (say, name) =>
    say("e1", [
      `The coroner took one look at the ${name} and laughed his ass off. You couldn't kill a fly with that. Not the weapon.`,
      `The ${name} came back from the lab clean. Cleaner than anyone in this damn room. Not the weapon.`,
      `The ${name} sat in the coat check all night under a pile of mink. Nobody touched the damn thing. Not the weapon.`,
    ]),
  exhibitPairClear: (say, a, b) =>
    say("e2", [
      `The ${a} and the ${b} sat behind the bar all night, right under the bartender's big nose. Neither one did shit. Not the weapon.`,
      `The lab cleared the ${a} and the ${b}. Spotless and boring as hell. Neither is the weapon.`,
    ]),
  roomClear: (say, label) =>
    say("r1", [
      `Not a drop of blood in ${mid(label)}. Some other fluids, maybe. Don't ask. The Don wasn't killed there.`,
      `The dust in ${mid(label)} hasn't been touched all night, which says a hell of a lot about the cleaning staff. Nobody died in there.`,
      `${label} was packed with drunk witnesses all night. Nobody could've whacked the Don in there without someone seeing. Not there.`,
    ]),
  roomClearHere: (label) =>
    `This room is clean. Well, not clean-clean, but no blood. The Don wasn't killed in ${mid(label)}.`,
  twistMoved: (body) =>
    `The twist: the Don wasn't even killed in ${mid(body)}. Some son of a bitch dragged his fat ass there afterward. Look at the carpet.`,
  twistStayed: (body) =>
    `The twist: no drag marks. Nobody hauled his heavy ass anywhere. The Don was killed right where he dropped, in ${mid(body)}.`,
  herring: (say, s) =>
    say("h", [
      `Found next to the body: ${q(s)}. Whoever owns that has some explaining to do, and probably a lawyer to call.`,
      `A drunk witness swears they saw ${q(s)} near the Don right before he croaked. Then again, the witness was seeing two of everything.`,
    ]),
  flavor: [
    "An empty bottle of the Don's private gin. Some greedy bastard finished it. Nothing more.",
    "A losing betting slip on a horse named Lucky Bastard. It tells you jack about tonight.",
    "Lipstick on a champagne glass. Half the room wears that shade, and the other half wishes they could pull it off.",
    "A stack of unpaid tabs with the Don's notes in the margins: deadbeat, cheapskate, owes me a kidney. Everybody owed him.",
    "A whoopee cushion under the Don's chair. Childish. Hilarious. Useless.",
    "A cold cigar, barely smoked. The Don hated wasting a good cigar almost as much as he hated all of you.",
  ],
  tipLabel: "Psst. A tip, just for you. Share it, trade it or keep your damn mouth shut.",
  motives: [
    "The Don owed you a fortune and laughed in your face when you asked for it. Then he farted. On purpose.",
    "He caught you skimming from the till and swore he'd break your goddamn kneecaps.",
    "He told everyone what your {s} is really for, and now nobody will shake your hand.",
    "He fired your sweetheart from the band for sounding like a cat in a blender. Rude. Accurate, but rude.",
    "You lost your car to him in a card game, and that cheating bastard had aces up both sleeves.",
    "He cut you out of a deal you'd busted your ass on for a year.",
    "He knew what you did in Detroit, and he wouldn't shut the hell up about it.",
    "He promised you a cut of the bootleg money and paid you in IOUs and bad advice.",
    "He was about to marry the person you've been in love with for years. The bastard.",
    "He gave your favorite booth to a rival and pissed in your potted plant.",
    "He called you a two-bit nobody in front of the whole damn room. Twice.",
    "He was holding your granddad's watch as collateral and wearing it just to rub it in.",
    "He framed your brother for a job the Don pulled himself. Your brother's still in the can.",
    "He was going to shut down the hustle you run out of the back, and that hustle pays your rent.",
  ],
  secrets: [
    "You've been ratting to the Feds for months, and you're shit at it.",
    "Your {s} is stolen, and the real owner is somewhere in this room, drunk.",
    "You're flat broke. Every dollar you're flashing tonight belongs to your mother.",
    "You snuck somewhere off-limits tonight looking for something. You found something way worse.",
    "Your real name is on a wanted poster in Cleveland, and the drawing makes you look fat.",
    "You've been watering down the gin for months and pocketing the difference.",
    "You're secretly engaged to two different people at this party.",
    "You owe a rival outfit so much money they've started sending you Christmas cards.",
    "You cheated your ass off at cards tonight and won big.",
    "You were supposed to deliver a message to the Don tonight. You ate it instead. Literally.",
    "You've been writing the Don's love letters for him, and they were NOT to his wife.",
    "You got fired from your last job for stealing toilet paper. In bulk.",
    "You've been sending the Don anonymous threats as a joke, and some of them were pretty damn good.",
    "Somebody paid you twenty bucks to keep an eye on someone here tonight. You already lost track of them.",
  ],
  killerLines: (f) => [
    `You did it. You whacked Don Ray Sanders with the ${f.weapon.toLowerCase()} in ${mid(f.room)}.`,
    f.ownWeapon
      ? `The ${f.weapon.toLowerCase()} is the weapon you brought, genius. If anyone figures that out, start lying your ass off.`
      : `The ${f.weapon.toLowerCase()} isn't even your weapon. Lucky break, you sneaky bastard.`,
    ...(f.accompliceName ? [`Your accomplice is ${f.accompliceName}. They know what you did and they'll lie for you, which is more than your own family would do.`] : []),
    "Over three rounds the evidence will close in on you. Your job: keep these idiots guessing.",
    ...(f.herringName ? [`One clue points at ${f.herringName}. Throw them under the bus.`] : []),
    f.accompliceName
      ? `You can lie about anything tonight, and so can ${f.accompliceName}. Everyone else can only lie about their own dirty secrets.`
      : "You can lie about anything tonight. Everyone else can only lie about their own dirty secrets.",
    ...(f.accompliceName ? [`If the cops get close, pin it on ${f.accompliceName}. That's what accomplices are for. It's in the brochure.`] : []),
    "Stay out of jail: jailbirds can't lock in. Getting some other sucker jailed is fair game.",
    f.accompliceName
      ? "You and your accomplice win unless more than half of these clowns get you, the weapon and the room."
      : "You win unless more than half of these clowns get you, the weapon and the room.",
  ],
  innocentLines: [
    "You're innocent. You didn't kill the Don, for once in your life.",
    "You can lie about your secret, but not about the murder. Only the killer gets to bullshit about that.",
    "Find the markers, compare notes, and figure out who did it, with what, and where.",
    "After every round, vote somebody into jail if most of you agree. Jailbirds can't search, vote or lock in.",
  ],
  // Accomplice games (v2), with Heston's comedy notes: deadpan, specific, the swearing rationed.
  accompliceLines: (f) => [
    `You're the accomplice. You didn't kill the Don. You just know who did: ${f.killerName}.`,
    `${f.killerName} did it with the ${f.weapon.toLowerCase()} in ${mid(f.room)}. You were not consulted.`,
    ...(f.ownWeapon ? [`The ${f.weapon.toLowerCase()} is the weapon you brought, so people are going to have questions. Have answers.`] : []),
    `Your job: keep ${f.killerName} out of the slammer. Point fingers, muddy the water, and look innocent, which for you will take practice.`,
    ...(f.herringIsMe
      ? [`One clue points at you. Good. Every minute they waste on you is a minute they're not spending on ${f.killerName}.`]
      : f.herringName
        ? [`One clue points at ${f.herringName}. Help it stick.`]
        : []),
    "You can lie about anything tonight, same as the killer. Everybody else only gets to lie about their own dirty secrets.",
    `You didn't do it, so the evidence can't prove you did. Sooner or later it'll clear you. Watch your back: if it gets hot, ${f.killerName} will throw you under a streetcar without slowing down.`,
    "Stay out of jail. If the killer walks, you walk with them.",
  ],
  innocentLinesAcc: [
    "You're innocent. You didn't kill the Don, for once in your life.",
    "Tonight the killer brought a friend: an accomplice who didn't do it, knows who did, and will lie through their teeth about it.",
    "You can lie about your secret, but not about the murder. Only the killer and the accomplice get to bullshit about that.",
    "Find the markers, compare notes, and figure out who did it, with what, and where. When you lock in, take a guess at the accomplice too.",
    "After every round, vote somebody into jail if most of you agree. Jailbirds can't search, vote or lock in.",
  ],
};
