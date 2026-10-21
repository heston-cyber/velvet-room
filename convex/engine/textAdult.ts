// The Adult script: same logic, same facts in every clue, filthier mouth.
// Chosen per game in the game menu. Crude and profane, never hateful. Oct 17: mild words only.
import { list, mid, theList, type Script } from "./text";

export const ADULT: Script = {
  suspectClear: [
    { at: ["bath"], t: (n) => `${n} was locked in the can for twenty damn minutes. Three people in line heard every second of it. Cleared, and frankly, get that checked.` },
    { at: ["bar"], t: (n) => `A flash photo shows ${n} hammered and slow dancing with a coat rack by the bar at the very moment the Don went quiet. Cleared.` },
    { at: ["cards"], t: (n) => `${n} spent the whole time getting their ass handed to them at cards. Five smug card sharps vouch for it. Cleared.` },
    { at: ["lounge"], t: (n) => `The bandleader says ${n} was screaming the wrong words to every damn song. Too busy embarrassing themselves to kill anybody. Cleared.` },
    { at: ["out"], t: (n) => `${n} was out back puking in the bushes the whole time. The doorman held their hair. Cleared.` },
    { at: ["out"], t: (n) => `A cab driver waited at the curb while ${n} turned out every pocket looking for the fare. Took the whole damn stretch. Cleared, and broke.` },
    { at: ["front"], t: (n) => `${n} spent the whole stretch on the hall telephone yelling at a bookie. The operator heard every word and blushed. Cleared.` },
    { at: ["kitchen"], t: (n) => `The cook caught ${n} in the kitchen eating oysters straight off the ice the whole damn time. Cleared, and banned from the kitchen.` },
    { at: ["out"], t: (n) => `The beat cop on the corner spent the whole stretch telling ${n} to go home. ${n} did not go home. Cleared.` },
    { at: ["out"], t: (n) => `${n} was stuck on the fire escape after the window jammed, yelling for help in front of half the street. Cleared, and a laughingstock.` },
  ],
  suspectPairClear: [
    { at: ["front"], t: (a, b) => `${a} and ${b} spent the whole night screaming at each other in the coat check over a forty-cent bar tab. They alibi each other, sadly. Both cleared.` },
    { at: ["out"], t: (a, b) => `${a} and ${b} were out back sharing a cigar and talking crap about the Don's toupee when it happened. Both cleared.` },
    { at: ["bar"], t: (a, b) => `The bartender swears ${a} and ${b} never left the bar. He'd know, because neither cheapskate tipped. Both cleared.` },
    { at: ["kitchen"], t: (a, b) => `${a} and ${b} lost every hand of checkers in the kitchen to the dishwasher, who has not shut up about it. Both cleared.` },
    { at: ["out"], t: (a, b) => `${a} and ${b} were across town on a liquor run and stumbled back in after the Don was already dead. The cabbie wants his money. Both cleared.` },
    { at: ["out"], t: (a, b) => `${a} and ${b} spent the whole stretch on the front steps arguing about the Yankees with the doorman. Nobody won. Both cleared.` },
  ],
  suspectTrioClear: [
    { at: ["cards"], t: (a, b, c) => `${a}, ${b} and ${c} were at the craps table losing their asses the whole damn time. The dealer's sick of all three of them. All cleared.` },
    { t: (a, b, c) => `${a}, ${b} and ${c} are in the photographer's group shot from the exact minute the Don died, all three blinking like idiots. All cleared.` },
    { at: ["lounge"], t: (a, b, c) => `The band watched ${a}, ${b} and ${c} butcher the Charleston right through it. Nobody who dances that badly has time to kill. All three cleared.` },
    { at: ["out"], t: (a, b, c) => `${a}, ${b} and ${c} were in the alley trying to push a stalled delivery truck. It did not move. Neither did they. All three cleared.` },
    { at: ["out"], t: (a, b, c) => `${a}, ${b} and ${c} were on the front steps singing at a streetcar. Half the block heard it. Half the block wants a word. All three cleared.` },
    { t: (a, b, c) => `A fortune teller had ${a}, ${b} and ${c} at her table the whole stretch. She saw no murder in their futures, just a lot of bad decisions. All three cleared.` },
  ],
  witness: (say, sex, cleared) =>
    say("w", [
      sex === "m"
        ? `The coat-check girl saw the killer sneak out the side door: a man, hat pulled down like a two-bit cartoon villain. That clears ${list(cleared)}.`
        : `The coat-check girl saw the killer sneak out the side door: a woman in a long coat, cool as hell. That clears ${list(cleared)}.`,
      sex === "m"
        ? `A drunk in the alley heard a man chewing the Don out right before he died. The killer's a man, so ${list(cleared)} are off the hook.`
        : `A drunk in the alley heard a woman chewing the Don out right before he died. The killer's a woman, so ${list(cleared)} are off the hook.`,
      sex === "m"
        ? `Footprints in the spilled gin lead away from the body: a man's size twelves. That clears ${list(cleared)}, and somebody owes the club a mop.`
        : `Footprints in the spilled gin lead away from the body: a woman's heels. That clears ${list(cleared)}, and somebody owes the club a mop.`,
      sex === "m"
        ? `The cigarette girl bumped into the killer in the dark right after: a man, reeking of cheap cologne. Like, really cheap. That clears ${list(cleared)}.`
        : `The cigarette girl bumped into the killer in the dark right after: a woman, drowning in French perfume. That clears ${list(cleared)}.`,
      sex === "m"
        ? `A newsboy across the street saw somebody climb out a back window right after: a man in a fedora, real clumsy about it. That clears ${list(cleared)}.`
        : `A newsboy across the street saw somebody climb out a back window right after: a woman in a cloche hat, graceful as hell. That clears ${list(cleared)}.`,
    ]),
  coroner: (say, kind, positive, weapons) => {
    const out = `That rules out ${theList(weapons)}.`;
    if (positive)
      return {
        blunt: `The coroner's report: somebody caved the Don's head in with something heavy. ${out}`,
        blade: `The coroner's report: one deep, clean cut. Something sharp as hell did this. ${out}`,
        gun: `The coroner's report: somebody shot the Don. Point-blank, the cold-blooded rat. ${out}`,
        cord: `The coroner's report: marks around the Don's neck. Somebody strangled the poor sap. ${out}`,
        other: `The coroner's report: not a damn mark on him. No wound anywhere. ${out}`,
      }[kind];
    return say(`c-${kind}`, [
      {
        blunt: `The coroner's report: no fractures, no crushing injuries. Nobody clobbered the old crook. Nothing heavy was used. ${out}`,
        blade: `The coroner's report: no stab wounds, no slashes. Nothing sharp touched the old so-and-so. ${out}`,
        gun: `The coroner's report: no gunshot wound, and nobody heard a shot all damn night. ${out}`,
        cord: `The coroner's report: no marks around the Don's neck. Nobody strangled him, though God knows people wanted to. ${out}`,
        other: `The coroner's report: no poison in his blood, no water in his lungs. Just gin. So much gin. ${out}`,
      }[kind],
    ]);
  },
  exhibitClear: [
    { at: ["front"], t: (w) => `The ${w} sat in the coat check all night under a pile of mink. Nobody laid a damn finger on the pile. Not the weapon.` },
    { t: (w) => `The Don locked the ${w} in his office safe before the party. Only he knew the combination, and he's not talking. Not the weapon.` },
    { t: (w) => `A three-hundred-pound bouncer sat on the crate with the ${w} in it all damn night. Nobody got near it. Not the weapon.` },
    { t: (w) => `The ${w} spent the night in a locked display case, and the only key was in the Don's pocket the whole time. Not the weapon.` },
    { at: ["lounge"], t: (w) => `The ${w} sat on the bandstand all night in front of everybody, like a damn centerpiece. Not the weapon.` },
    { t: (w) => `The ${w} came back from the repair shop this morning, still wrapped in brown paper, string still tied. Not the weapon.` },
  ],
  exhibitGunClear: [
    { t: (w) => `The ${w} is still fully loaded and hasn't been fired all damn night. Not the weapon.` },
    { t: (w) => `Not a whiff of powder on the ${w}. Nobody fired the damn thing tonight. Not the weapon.` },
    { t: (w) => `The ${w} is rusted solid. It couldn't fire tonight if you begged it. Not the weapon.` },
    { t: (w) => `The ${w} is still wrapped in the Don's oilcloth, knots untouched. Not the weapon.` },
  ],
  exhibitPairClear: [
    { at: ["bar"], t: (a, b) => `The ${a} and the ${b} sat behind the bar all night, right under the bartender's big nose. Neither one did squat. Not the weapon.` },
    { t: (a, b) => `The Don locked the ${a} and the ${b} in his office safe before the party. Only he knew the combination, and he's in no shape to share it. Neither is the weapon.` },
    { at: ["out"], t: (a, b) => `The ${a} and the ${b} were in the trunk of the Don's car all night, and the chauffeur sat on the bumper eating peanuts. Neither is the weapon.` },
    { t: (a, b) => `The ${a} and the ${b} were locked in the supply closet, and the manager has the only damn key. Neither one was used.` },
  ],
  roomClear: [
    { seal: true, t: (r) => `${r} was locked tight from the start of the party until the body turned up, and the manager kept the only damn key on a chain around his neck. The Don wasn't killed there.` },
    { seal: true, t: (r) => `Until the body turned up, nobody had set foot in ${mid(r)} all night. The dust proves it, and says a hell of a lot about the cleaning staff. Nobody died in there.` },
    { seal: true, t: (r) => `The staff tied a ribbon across the door of ${mid(r)} before the party, and it was still in one piece when the body turned up. Not there.` },
    { crowd: true, t: (r) => `${r} was packed with drunk witnesses all night. Nobody could've whacked the Don in there without someone seeing. Not there.` },
    { crowd: true, t: (r) => `A card game ran in ${mid(r)} all damn night with a dozen sore losers watching every move. Nobody got killed in there. Not there.` },
    { crowd: true, t: (r) => `${r} had a birthday toast for the bandleader going all evening. Thirty drunks, zero murders. Not there.` },
  ],
  twistMoved: (body) =>
    `The twist: the Don wasn't even killed in ${mid(body)}. Some rat dragged his fat ass there afterward. Look at the carpet.`,
  twistStayed: (body) =>
    `The twist: no drag marks. Nobody hauled his heavy ass anywhere. The Don was killed right where he dropped, in ${mid(body)}.`,
  herring: [
    { t: (n) => `A bar tab with ${n}'s name on it turned up in the Don's coat pocket. Whoever ran that up has some explaining to do, and probably a lawyer to call.` },
    { t: (n) => `Earlier tonight ${n} told the bartender the Don wouldn't live to see Sunday. Could be big talk. Could be a damn plan.` },
    { t: (n) => `A note in ${n}'s handwriting, stuffed in the Don's hatband: "We need to talk. Tonight." Talking isn't killing. Probably.` },
    { t: (n) => `${n} asked the coat-check girl where the hell the Don went. Twice. Nosy, or something worse?` },
  ],
  flavor: [
    "An empty bottle of the Don's private gin. Some greedy so-and-so finished it. Nothing more.",
    "A losing betting slip on a horse named Applesauce. It tells you jack about tonight.",
    "Lipstick on a champagne glass. Half the room wears that shade, and the other half wishes they could pull it off.",
    "A stack of unpaid tabs with the Don's notes in the margins: deadbeat, cheapskate, owes me a kidney. Everybody owed him.",
    "A whoopee cushion under the Don's chair. Childish. Hilarious. Useless.",
    "A cold cigar, barely smoked. The Don hated wasting a good cigar almost as much as he hated all of you.",
    "A deck of cards with every ace missing. Somebody's a cheat, just not a killer. Probably.",
    "A false mustache in the umbrella stand. Somebody's having a better night than you.",
    "A torn ticket stub for a picture show nobody here will admit to seeing. Cowards.",
    "Somebody's dentures in a champagne glass. Not evidence. Just disgusting.",
  ],
  killerLines: (f) => [
    `You did it. You whacked Don Ray Sanders with the ${f.weapon.toLowerCase()} in ${mid(f.room)}.`,
    // Only older games had weapons that belonged to a guest.
    ...(f.ownWeapon ? [`The ${f.weapon.toLowerCase()} is the weapon you brought, genius. If anyone figures that out, start lying your ass off.`] : []),
    ...(f.accompliceName ? [`Your accomplice is ${f.accompliceName}. They know what you did and they'll lie for you, which is more than your own family would do.`] : []),
    "Over three rounds the evidence will close in on you. Your job: keep these idiots guessing.",
    ...(f.herringName ? [`One clue points at ${f.herringName}. Throw them under the bus.`] : []),
    f.accompliceName ? `You can lie about anything tonight, and so can ${f.accompliceName}. Everyone else has to tell the truth, the suckers.` : "You can lie about anything tonight. Everyone else has to tell the truth, the suckers.",
    ...(f.accompliceName ? [`If the cops get close, pin it on ${f.accompliceName}. That's what accomplices are for. It's in the brochure.`] : []),
    "Stay out of jail: jailbirds can't lock in. Getting some other sucker jailed is fair game.",
    f.accompliceName
      ? "You and your accomplice win unless more than half of these clowns get you, the weapon and the room."
      : "You win unless more than half of these clowns get you, the weapon and the room.",
  ],
  innocentLines: [
    "You're innocent. You didn't kill the Don, for once in your life.",
    "Tell the truth. Only the killer gets to lie tonight.",
    "Find the evidence cards, compare notes, and figure out who did it, with what, and where.",
    "After Round 2 you can vote somebody into jail, if most of you agree; after Round 3, a vote to let them out. Jailbirds can't search, vote or lock in.",
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
    "You can lie about anything tonight, same as the killer. Everybody else has to tell the truth.",
    `You didn't do it, so the evidence can't prove you did. Sooner or later it'll clear you. Watch your back: if it gets hot, ${f.killerName} will throw you under a streetcar without slowing down.`,
    "Stay out of jail. If the killer walks, you walk with them.",
  ],
  innocentLinesAcc: [
    "You're innocent. You didn't kill the Don, for once in your life.",
    "Tonight the killer brought a friend: an accomplice who didn't do it, knows who did, and will lie through their teeth about it.",
    "Tell the truth. Only the killer and the accomplice get to lie tonight.",
    "Find the evidence cards, compare notes, and figure out who did it, with what, and where. When you lock in, take a guess at the accomplice too.",
    "After every round, vote somebody into jail if most of you agree. Jailbirds can't search, vote or lock in.",
  ],
};
