import type { FireworkDefinition } from './fireworkTypes';

// Individual animated studies based on the design catalogue; all remain review drafts.
export const FIREWORK_CATALOGUE: readonly FireworkDefinition[] = [
  {
    "id": "F01",
    "name": "Ruby Peony",
    "family": "peony",
    "description": "a clean, open red sphere; medium spread and a short finish.",
    "ascentBrief": "restrained ruby head; narrow warm-silver tracer that becomes thinner near the apex. Most of the tracer fades before the sphere opens.",
    "explosionBrief": "evenly distributed red stars on a three-dimensional spherical shell, with slight irregularity in brightness and spacing. Almost trail-free heads travel outward, slow, and dim separately. The center opens into dark sky; it does not stay filled by a glowing ball.",
    "soundBrief": "dry low lift **thump**, restrained airy ascent hiss, a clean **crack** over a compact low boom, then a short outdoor decay. No added crackle bed.",
    "recognition": "recognizable as a peony in monochrome because points, dark center, and empty spaces dominate.",
    "color": [
      1.0,
      0.1255,
      0.2627
    ],
    "trailColor": [
      1.0,
      0.7804,
      0.502
    ],
    "stars": 190,
    "speed": 17.0,
    "life": 2.7,
    "drag": 0.4,
    "gravity": 1.7,
    "tail": 0.07,
    "width": 0.15,
    "glitter": 0,
    "sound": {
      "bass": 89.0,
      "attack": 0.015,
      "decay": 1.2,
      "burn": 0.01,
      "whistle": false
    }
  },
  {
    "id": "F02",
    "name": "Sapphire Chrysanthemum",
    "family": "chrysanthemum",
    "description": "a full spherical flower with many fine radial trails; medium spread and a lingering finish.",
    "ascentBrief": "a bright silver needle with a fine blue-edged tracer; a few silver grains detach along the ascent.",
    "explosionBrief": "blue heads pull silver trails through the opening sphere. Trails begin straight, progressively arc down, and fade behind still-visible tips. Front and rear stars establish depth.",
    "soundBrief": "crisp lift report, fine rising **shhh**, a bright opening snap over a rounded boom, and a smooth silver-sizzle tail.",
    "recognition": "the trail flower remains distinct from F01's point sphere without relying on color.",
    "color": [
      0.2,
      0.498,
      1.0
    ],
    "trailColor": [
      0.7882,
      0.902,
      1.0
    ],
    "stars": 220,
    "speed": 17.0,
    "life": 3.7,
    "drag": 0.4,
    "gravity": 1.5,
    "tail": 0.95,
    "width": 0.115,
    "glitter": 1,
    "sound": {
      "bass": 104.0,
      "attack": 0.008,
      "decay": 1.7,
      "burn": 0.15,
      "whistle": false
    }
  },
  {
    "id": "F03",
    "name": "Amethyst Dahlia",
    "family": "dahlia",
    "description": "fewer, larger violet stars; wide spacing and a deliberately uncluttered silhouette.",
    "ascentBrief": "small violet head on a short, grainy bronze tracer with visible gaps.",
    "explosionBrief": "large violet heads form a sparse sphere. Brief tapered wakes emphasize initial speed; most of the travel is read from the heads themselves. Stars retain presence as their outward motion slows.",
    "soundBrief": "muffled lift **thoom**, coarse brief ascent breath, a woody full-bodied break, and a smooth low decay with little high-frequency fizz.",
    "recognition": "dark gaps and larger individual stars distinguish it from both Peony and Chrysanthemum.",
    "color": [
      0.7216,
      0.4,
      1.0
    ],
    "trailColor": [
      0.8471,
      0.6745,
      1.0
    ],
    "stars": 58,
    "speed": 19.0,
    "life": 3.8,
    "drag": 0.33,
    "gravity": 1.6,
    "tail": 0.18,
    "width": 0.26,
    "glitter": 0,
    "sound": {
      "bass": 67.0,
      "attack": 0.025,
      "decay": 1.5,
      "burn": 0.025,
      "whistle": false
    }
  },
  {
    "id": "F04",
    "name": "Emerald Heart Pistil",
    "family": "pistil",
    "description": "two concentric spherical layers with a dark band between them.",
    "ascentBrief": "green head with a tightly braided gold tracer; the gold disappears unevenly behind the head.",
    "explosionBrief": "a gold outer chrysanthemum opens around a smaller emerald sphere. Both originate from the same break; different outward speeds preserve the nested structure. The inner points expire before the final outer gold trails.",
    "soundBrief": "firm lift, restrained gold hiss, one layered **crack–boom**, followed by a short metallic shimmer. The two layers do not imply a second explosion.",
    "recognition": "two distinct radii remain visible from the main viewing area and side views.",
    "color": [
      1.0,
      0.7255,
      0.2824
    ],
    "trailColor": [
      1.0,
      0.8353,
      0.5882
    ],
    "stars": 180,
    "speed": 17.0,
    "life": 4.1,
    "drag": 0.43,
    "gravity": 1.3,
    "tail": 0.9,
    "width": 0.13,
    "glitter": 1,
    "sound": {
      "bass": 83.0,
      "attack": 0.012,
      "decay": 1.7,
      "burn": 0.09,
      "whistle": false
    }
  },
  {
    "id": "F05",
    "name": "Antique Gold Brocade",
    "family": "brocade",
    "description": "a rich, dense crown built from fine sparkling trails; broad and substantial.",
    "ascentBrief": "warm white head and a dense gold tracer shedding small side flecks.",
    "explosionBrief": "many gold branches spread into a rounded crown. Each main trail sheds fine glitter that makes the crown look woven. The branches sag, overlap, and diminish into a broad ember canopy.",
    "soundBrief": "heavy rounded lift **thump**, coarse metallic ascent, a deep **whump** with a brief crack, then a dense sand-like sparkle hiss that thins gradually.",
    "recognition": "density and small-scale branching distinguish it from Willow's separated strands.",
    "color": [
      1.0,
      0.8157,
      0.5255
    ],
    "trailColor": [
      0.8196,
      0.6118,
      0.2824
    ],
    "stars": 270,
    "speed": 17.0,
    "life": 5.8,
    "drag": 0.48,
    "gravity": 1.1,
    "tail": 1.9,
    "width": 0.1,
    "glitter": 5,
    "sound": {
      "bass": 57.0,
      "attack": 0.022,
      "decay": 2.4,
      "burn": 0.28,
      "whistle": false
    }
  },
  {
    "id": "F06",
    "name": "Champagne Willow",
    "family": "willow",
    "description": "a very broad canopy of exceptionally long, separated falling strands.",
    "ascentBrief": "slim champagne comet head with a quiet, steady tracer; trailing grains hang briefly behind it.",
    "explosionBrief": "a restrained opening spreads long-burning gold stars into a dome. Outward motion slows early while the strands continue falling, creating a weeping canopy. The longest paths remain thin and irregular.",
    "soundBrief": "low lift **puff-thump**, soft ascent rush, a broad bass-heavy boom with a rounded attack, then a long, very quiet brushing hiss. The visible tail can outlast the audible burn.",
    "recognition": "it remains recognizably drooping even after the initial burst is gone; density never turns it into Brocade.",
    "color": [
      1.0,
      0.8824,
      0.6353
    ],
    "trailColor": [
      0.8353,
      0.6784,
      0.3882
    ],
    "stars": 145,
    "speed": 15.0,
    "life": 8.1,
    "drag": 0.53,
    "gravity": 1.8,
    "tail": 2.65,
    "width": 0.105,
    "glitter": 2,
    "sound": {
      "bass": 48.0,
      "attack": 0.045,
      "decay": 3.2,
      "burn": 0.07,
      "whistle": false
    }
  },
  {
    "id": "F07",
    "name": "Copper Palm",
    "family": "palm",
    "description": "one pronounced rising trunk and a small set of thick, upward-opening fronds.",
    "ascentBrief": "strong copper-gold comet that leaves the thickest trunk-like rising tail in the catalogue.",
    "explosionBrief": "a sparse upper fan of heavy stars bends outward into fronds. Each frond has a hot leading tip and a granular wake. The trunk lingers beneath the crown, completing the palm silhouette.",
    "soundBrief": "punchy low lift, rough sustained **fshhh**, a chesty opening **thwump**, and several coarse, overlapping burn textures corresponding to the heavy fronds.",
    "recognition": "trunk and open upper fronds are both readable; it must not become a full spherical shell.",
    "color": [
      1.0,
      0.8118,
      0.549
    ],
    "trailColor": [
      0.8549,
      0.549,
      0.2392
    ],
    "stars": 11,
    "speed": 19.0,
    "life": 5.4,
    "drag": 0.37,
    "gravity": 1.9,
    "tail": 1.5,
    "width": 0.24,
    "glitter": 9,
    "sound": {
      "bass": 61.0,
      "attack": 0.017,
      "decay": 2.0,
      "burn": 0.23,
      "whistle": false
    }
  },
  {
    "id": "F08",
    "name": "Golden Coconut",
    "family": "coconut",
    "description": "sparse, thick golden spokes with prominent pearl-like tips; a rounder silhouette than Palm.",
    "ascentBrief": "a compact white-gold head over a narrower, broken gold tracer. The rising line fades before the spokes dominate.",
    "explosionBrief": "heavy comet stars open in many directions around a sphere. Bright rounded heads stay visible at the ends of long gold tails. The spokes bow downward while maintaining their separation.",
    "soundBrief": "tight lift **tok-thump**, grainy short ascent, a hard central report with a hollow low body, then separated raspy comet burns over a medium decay.",
    "recognition": "pearl tips and full radial spread distinguish it from the trunk-and-fronds Palm.",
    "color": [
      1.0,
      0.9255,
      0.7725
    ],
    "trailColor": [
      0.9373,
      0.7059,
      0.2784
    ],
    "stars": 23,
    "speed": 19.0,
    "life": 4.9,
    "drag": 0.38,
    "gravity": 1.7,
    "tail": 1.2,
    "width": 0.23,
    "glitter": 5,
    "sound": {
      "bass": 74.0,
      "attack": 0.008,
      "decay": 1.8,
      "burn": 0.19,
      "whistle": false
    }
  },
  {
    "id": "F09",
    "name": "Silver Spider",
    "family": "spider",
    "description": "a fast, wide opening with a small number of long silver legs.",
    "ascentBrief": "thin silver streak with a compact head and little lingering debris.",
    "explosionBrief": "stars race outward, leaving narrow bright paths, then visibly lose speed. Long legs droop at the tips while their inner sections fade. Controlled asymmetry makes the form feel energetic.",
    "soundBrief": "sharp lift snap, quick airy **zip**, a fast, aggressive opening crack, and a short bright tearing hiss over a compact bass body.",
    "recognition": "the fast-to-slow movement and sparse long legs distinguish it from Chrysanthemum.",
    "color": [
      0.9294,
      0.9843,
      1.0
    ],
    "trailColor": [
      0.6745,
      0.8,
      0.9294
    ],
    "stars": 27,
    "speed": 26.0,
    "life": 3.3,
    "drag": 0.95,
    "gravity": 2.0,
    "tail": 1.0,
    "width": 0.17,
    "glitter": 1,
    "sound": {
      "bass": 117.0,
      "attack": 0.004,
      "decay": 1.0,
      "burn": 0.2,
      "whistle": false
    }
  },
  {
    "id": "F10",
    "name": "Amber Waterfall",
    "family": "waterfall",
    "description": "a narrow aerial crown feeding a long downward curtain.",
    "ascentBrief": "understated amber tracer with a small bright head, leaving room for the curtain's shape.",
    "explosionBrief": "a compact opening separates into near-parallel hanging trails. Vertical descent dominates lateral expansion; different lengths form an uneven lower edge. Trails terminate in the air as their stars burn out.",
    "soundBrief": "low soft lift, faint ascent hiss, a rounded restrained opening boom, then a continuous granular **shhhhh** that gradually thins from the top of the falling mass.",
    "recognition": "reads as a curtain, not a wide Willow dome. This is an aerial interpretation of the reference.",
    "color": [
      1.0,
      0.7961,
      0.4431
    ],
    "trailColor": [
      0.7765,
      0.549,
      0.2235
    ],
    "stars": 99,
    "speed": 8.0,
    "life": 7.1,
    "drag": 0.7,
    "gravity": 1.2,
    "tail": 2.3,
    "width": 0.12,
    "glitter": 3,
    "sound": {
      "bass": 53.0,
      "attack": 0.04,
      "decay": 2.5,
      "burn": 0.25,
      "whistle": false
    }
  },
  {
    "id": "F11",
    "name": "White Strobe",
    "family": "strobe",
    "description": "a loose sphere whose white stars independently blink into and out of view.",
    "ascentBrief": "short silver tracer with irregular bright flecks; it does not blink as a single solid line.",
    "explosionBrief": "a modest break establishes the star sphere. Stars keep moving through their dark intervals and reappear farther along the same paths. Different phases prevent a synchronized full-sphere flash. Trails remain extremely short.",
    "soundBrief": "dry lift, fine hiss, a tight metallic break and airy decay. Flickering light does not automatically create a new pop; this profile has no continuous crackling layer.",
    "recognition": "coherent trajectories remain evident across the dark intervals; brightness modulation owns the identity.",
    "color": [
      0.9333,
      0.9804,
      1.0
    ],
    "trailColor": [
      0.749,
      0.8431,
      1.0
    ],
    "stars": 165,
    "speed": 15.0,
    "life": 4.8,
    "drag": 0.5,
    "gravity": 1.3,
    "tail": 0.06,
    "width": 0.19,
    "glitter": 0,
    "sound": {
      "bass": 124.0,
      "attack": 0.006,
      "decay": 1.1,
      "burn": 0.018,
      "whistle": false
    }
  },
  {
    "id": "F12",
    "name": "Rose Gold Glitter",
    "family": "glitter",
    "description": "an airy rounded crown covered in fine, irregular shimmer.",
    "ascentBrief": "rose-colored head with a gold dust tracer and tiny delayed glints.",
    "explosionBrief": "warm rose tips spread outward while their gold wakes shed many small glitter particles. The canopy shimmers continuously as it slowly drops; it never snaps into whole-star on/off strobing.",
    "soundBrief": "soft granular lift, dry brushing ascent, a bright but rounded bloom of sound, and a delicate, even **sisss** with fine grit rather than isolated loud pops.",
    "recognition": "shimmering trails separate it from White Strobe's blinking heads and Crackle's miniature explosions.",
    "color": [
      1.0,
      0.7294,
      0.6824
    ],
    "trailColor": [
      0.9373,
      0.7882,
      0.5255
    ],
    "stars": 140,
    "speed": 15.0,
    "life": 5.1,
    "drag": 0.48,
    "gravity": 1.2,
    "tail": 1.25,
    "width": 0.1,
    "glitter": 8,
    "sound": {
      "bass": 78.0,
      "attack": 0.022,
      "decay": 1.7,
      "burn": 0.18,
      "whistle": false
    }
  },
  {
    "id": "F13",
    "name": "Dragon-Egg Crackle",
    "family": "crackle",
    "description": "a gold burst whose branch ends each erupt into tiny local flashes.",
    "ascentBrief": "chunky gold tracer with occasional sharp glitter grains.",
    "explosionBrief": "a medium gold sphere opens, then parent stars produce small secondary bursts distributed along the outer shape. Each secondary event has a tiny flash, a few very short sparks, and rapid extinction. The parent crown remains readable.",
    "soundBrief": "coarse lift thump, grainy ascent, a strong main report, then clearly separated **krr-pop-pop** clusters. Audible secondary pops follow the actual secondary events.",
    "recognition": "locally expanding mini-bursts distinguish it from simple blinking particles.",
    "color": [
      1.0,
      0.7098,
      0.3059
    ],
    "trailColor": [
      0.902,
      0.5765,
      0.2118
    ],
    "stars": 47,
    "speed": 16.0,
    "life": 3.7,
    "drag": 0.43,
    "gravity": 1.6,
    "tail": 0.8,
    "width": 0.17,
    "glitter": 2,
    "sound": {
      "bass": 94.0,
      "attack": 0.007,
      "decay": 1.5,
      "burn": 0.08,
      "whistle": false
    }
  },
  {
    "id": "F14",
    "name": "Golden Time Rain",
    "family": "rain",
    "description": "a hanging gold field that begins restrained and gradually releases fine crackling rain.",
    "ascentBrief": "dense but dim bronze tracer punctuated by small golden beads.",
    "explosionBrief": "slow gold parents spread into a broad canopy. Fine bright flecks appear progressively along the descending parents, producing a delayed granular rain with uneven depth. Each parent exhausts separately.",
    "soundBrief": "low lift knock, husky ascent, a restrained deep opening boom, a perceptible lull in high-frequency detail, then a widening fine **prrrr** crackle bed that tapers gradually.",
    "recognition": "gradual release and sustained falling texture distinguish it from Crackle's discrete terminal bursts.",
    "color": [
      0.8706,
      0.7098,
      0.4078
    ],
    "trailColor": [
      0.7412,
      0.5647,
      0.2471
    ],
    "stars": 110,
    "speed": 14.0,
    "life": 6.9,
    "drag": 0.58,
    "gravity": 1.0,
    "tail": 1.3,
    "width": 0.11,
    "glitter": 5,
    "sound": {
      "bass": 51.0,
      "attack": 0.03,
      "decay": 2.6,
      "burn": 0.12,
      "whistle": false
    }
  },
  {
    "id": "F15",
    "name": "Jade Falling Leaves",
    "family": "leaves",
    "description": "a gentle cloud of luminous green embers fluttering down at different rates.",
    "ascentBrief": "small jade head on a sparse silver tracer with little lingering brightness.",
    "explosionBrief": "a soft release makes a loose star cloud rather than a sharply defined sphere. Stars flutter laterally, slow quickly, and descend with tiny wakes. Brightness drifts smoothly. Individual points must not look like literal leaf meshes.",
    "soundBrief": "rounded small lift, whisper-like ascent, a muted **pup-boom**, and a restrained breathy tail that becomes almost silent while the embers continue falling.",
    "recognition": "slow drift dominates; no fast darting Fish or Bees behavior.",
    "color": [
      0.5529,
      1.0,
      0.6706
    ],
    "trailColor": [
      0.3961,
      0.7843,
      0.6078
    ],
    "stars": 79,
    "speed": 12.0,
    "life": 5.9,
    "drag": 1.1,
    "gravity": 0.48,
    "tail": 0.1,
    "width": 0.16,
    "glitter": 0,
    "sound": {
      "bass": 65.0,
      "attack": 0.04,
      "decay": 1.1,
      "burn": 0.028,
      "whistle": false
    }
  },
  {
    "id": "F16",
    "name": "Silver Snowflakes",
    "family": "snow",
    "description": "small, airy clusters of white sparks settling like luminous snow.",
    "ascentBrief": "fine silver powder tracer, slightly wider and softer than Spider's needle.",
    "explosionBrief": "a restrained release creates widely separated groups of tiny sparks. Each group has a bright center and a few ephemeral micro-sparks, then descends gently. Group members twinkle softly without repeated hard flashes.",
    "soundBrief": "light papery lift, powdery ascent, a delicate crisp break over a shallow low body, followed by a fine dry brushing texture. No bells or synthetic chimes.",
    "recognition": "grouped micro-sparks distinguish this authored reference interpretation from Strobe and Falling Leaves.",
    "color": [
      0.9333,
      0.9647,
      1.0
    ],
    "trailColor": [
      0.6588,
      0.7686,
      0.9059
    ],
    "stars": 34,
    "speed": 12.0,
    "life": 5.5,
    "drag": 0.8,
    "gravity": 0.55,
    "tail": 0.11,
    "width": 0.14,
    "glitter": 1,
    "sound": {
      "bass": 136.0,
      "attack": 0.012,
      "decay": 0.85,
      "burn": 0.07,
      "whistle": false
    }
  },
  {
    "id": "F17",
    "name": "Jade Crossette",
    "family": "crossette",
    "description": "green parent comets that each split into four shorter children.",
    "ascentBrief": "narrow green-white tracer that sheds a few gold grains.",
    "explosionBrief": "a small set of parents fans out with visible green tails. At a defined point in each parent's life, four children split from its current location and retain its outward momentum. Their brief crossing trails read as local plus-shaped branches before gravity bends them.",
    "soundBrief": "firm lift, clean ascent hiss, a compact central report followed by short, dry secondary **tak** sounds from the split locations. Child sounds remain lower in weight than the main break.",
    "recognition": "every parent splits into four from its actual moving position; no unrelated cross appears at the original center.",
    "color": [
      0.3961,
      1.0,
      0.6431
    ],
    "trailColor": [
      0.6588,
      1.0,
      0.7451
    ],
    "stars": 14,
    "speed": 15.0,
    "life": 2.0,
    "drag": 0.35,
    "gravity": 1.2,
    "tail": 0.9,
    "width": 0.19,
    "glitter": 1,
    "sound": {
      "bass": 108.0,
      "attack": 0.005,
      "decay": 1.25,
      "burn": 0.045,
      "whistle": false
    }
  },
  {
    "id": "F18",
    "name": "Aqua Fish",
    "family": "fish",
    "description": "a modest central burst releasing stars that briefly swim away along curved paths.",
    "ascentBrief": "aqua head, narrow white tracer, and short detached blue-white flecks.",
    "explosionBrief": "stars open into a loose cloud, then each follows a smooth changing direction for a brief active phase. Short tails reveal local curves. After that phase, heads coast and fall; they do not continue steering indefinitely.",
    "soundBrief": "light lift thump, thin ascending breath, a modest bright break, then scattered short fluttering **fssht** textures with a soft low decay.",
    "recognition": "short smooth independent turns distinguish Fish from the long continuous Silver Dragon branches.",
    "color": [
      0.3961,
      0.9059,
      1.0
    ],
    "trailColor": [
      0.6784,
      0.8667,
      1.0
    ],
    "stars": 66,
    "speed": 12.0,
    "life": 3.3,
    "drag": 0.48,
    "gravity": 1.2,
    "tail": 0.38,
    "width": 0.17,
    "glitter": 0,
    "sound": {
      "bass": 112.0,
      "attack": 0.015,
      "decay": 1.1,
      "burn": 0.1,
      "whistle": false
    }
  },
  {
    "id": "F19",
    "name": "Amber Bees",
    "family": "bees",
    "description": "a tighter burst of fast gold heads that dart and scatter.",
    "ascentBrief": "bright amber head with a broken, grainy tail and a slightly rougher burn.",
    "explosionBrief": "many small heads leave a compact center, briefly accelerate along divergent paths, then dart through short curves. Their life is brisk; wakes are shorter and direction changes more abrupt than Fish. Motion stays finite and rooted in the break.",
    "soundBrief": "tight lift **pop**, rough ascent rush, a papery central crack, then brief raspy, uneven buzzing burn textures. Keep it combustible and airy, not an electronic insect loop.",
    "recognition": "compact scale, brisk agitation, and short life distinguish it from Aqua Fish.",
    "color": [
      1.0,
      0.8275,
      0.3255
    ],
    "trailColor": [
      1.0,
      0.7255,
      0.1725
    ],
    "stars": 100,
    "speed": 13.0,
    "life": 2.5,
    "drag": 0.55,
    "gravity": 1.4,
    "tail": 0.25,
    "width": 0.15,
    "glitter": 1,
    "sound": {
      "bass": 148.0,
      "attack": 0.006,
      "decay": 0.9,
      "burn": 0.14,
      "whistle": false
    }
  },
  {
    "id": "F20",
    "name": "Silver Dragon",
    "family": "dragon",
    "description": "several silver serpents drawing long, continuously twisting paths.",
    "ascentBrief": "white-silver tracer with a subtle corkscrew in its shedding pattern; a restrained wavering whistle is this design's characteristic ascent sound.",
    "explosionBrief": "a small opening releases a few long-burning heads with finite rotating lateral thrust. Their continuous trails form elongated bends and loops as the whole assembly travels outward and down. The branches do not all rotate together.",
    "soundBrief": "firm lift, airy wavering ascent whistle, a hard compact break, and several narrow, raspy descending burn textures that stop as the heads exhaust.",
    "recognition": "long continuous individual serpents; no shared pinwheel center.",
    "color": [
      0.9373,
      0.9804,
      1.0
    ],
    "trailColor": [
      0.7137,
      0.8353,
      0.9569
    ],
    "stars": 12,
    "speed": 14.0,
    "life": 4.8,
    "drag": 0.3,
    "gravity": 1.2,
    "tail": 1.5,
    "width": 0.2,
    "glitter": 4,
    "sound": {
      "bass": 101.0,
      "attack": 0.007,
      "decay": 1.5,
      "burn": 0.23,
      "whistle": true
    }
  },
  {
    "id": "F21",
    "name": "Blue Jellyfish",
    "family": "jellyfish",
    "description": "a rounded blue cap over a small number of long gold tendrils.",
    "ascentBrief": "small blue-white head over a restrained gold stem.",
    "explosionBrief": "an upper hemisphere of short-lived blue points opens while slower gold stars descend below it. The cap thins as the tendrils lengthen. The shape emerges from separate star populations with different velocities and lifetimes; it is never a translucent jellyfish mesh.",
    "soundBrief": "soft low lift, fine gold hiss, a deep rounded opening with a bright short cap of noise, then a gentle falling sizzle associated with the tendrils.",
    "recognition": "the cap and lower tendrils overlap long enough to read together from the crowd view.",
    "color": [
      0.3294,
      0.6235,
      1.0
    ],
    "trailColor": [
      0.7333,
      0.8627,
      1.0
    ],
    "stars": 135,
    "speed": 13.0,
    "life": 3.0,
    "drag": 0.6,
    "gravity": 0.55,
    "tail": 0.15,
    "width": 0.15,
    "glitter": 0,
    "sound": {
      "bass": 59.0,
      "attack": 0.035,
      "decay": 2.3,
      "burn": 0.1,
      "whistle": false
    }
  },
  {
    "id": "F22",
    "name": "Ruby Halo Ring",
    "family": "ring",
    "description": "a clean ring of separate red points around an empty center.",
    "ascentBrief": "dim ruby tracer with a silver needle at its head; the ascent line disappears quickly after the break.",
    "explosionBrief": "stars expand along a defined world-space plane. Their short wakes fade quickly, leaving a ring with slightly imperfect spacing. Gravity later lowers and softens the shape; the ring is not a rigid object.",
    "soundBrief": "clean lift click-thump, short ascent hush, a precise dry report with a concise bass body and very little residual sparkle.",
    "recognition": "it stays hollow. It is allowed to appear elliptical or nearly edge-on from side viewpoints; it must not secretly rotate to face each viewer.",
    "color": [
      1.0,
      0.2431,
      0.3961
    ],
    "trailColor": [
      1.0,
      0.6275,
      0.5961
    ],
    "stars": 99,
    "speed": 16.0,
    "life": 3.3,
    "drag": 0.45,
    "gravity": 1.0,
    "tail": 0.07,
    "width": 0.19,
    "glitter": 0,
    "sound": {
      "bass": 91.0,
      "attack": 0.007,
      "decay": 1.15,
      "burn": 0.02,
      "whistle": false
    }
  },
  {
    "id": "F23",
    "name": "Violet Spiral",
    "family": "spiral",
    "description": "a two-turn open spiral of separate violet stars with a pale silver accent near its center.",
    "ascentBrief": "violet head and a lightly twisted silver tracer, finer and quieter than Silver Dragon's.",
    "explosionBrief": "stars open along an authored spiral distribution in a shallow volume. Radius and angular placement establish the shape; short trailing glints reinforce it. The stars expand and fall independently, gradually loosening the spiral without rotating it as a solid logo.",
    "soundBrief": "small resonant lift, thin rising hiss, a crisp opening report over a smooth rounded body, then a brief soft wavering sizzle. No added magical sweep.",
    "recognition": "the gap between successive turns survives the opening and early decay. This is a stylized signature pattern with a defined viewing orientation.",
    "color": [
      0.7216,
      0.4588,
      1.0
    ],
    "trailColor": [
      0.8275,
      0.7059,
      1.0
    ],
    "stars": 125,
    "speed": 17.0,
    "life": 3.6,
    "drag": 0.5,
    "gravity": 0.85,
    "tail": 0.12,
    "width": 0.16,
    "glitter": 0,
    "sound": {
      "bass": 82.0,
      "attack": 0.016,
      "decay": 1.6,
      "burn": 0.08,
      "whistle": false
    }
  },
  {
    "id": "F24",
    "name": "Silver Whirlwind",
    "family": "whirlwind",
    "description": "a burst of curved silver spokes suggesting a rotating pinwheel.",
    "ascentBrief": "a thin bright head over a silver tail that sheds alternating small side flecks.",
    "explosionBrief": "stars combine outward travel with tangential motion for a finite interval. Their trails describe similarly handed arcs; individual heads then coast and drop. The visual center becomes empty as stars leave it. This design interprets the references labeled Spinner and Whirlwind.",
    "soundBrief": "crisp lift, fluttering ascent rush, a bright central crack and a coarse swirling burn envelope that decays into a low outdoor tail. Spatial motion follows sources, not an arbitrary stereo rotation.",
    "recognition": "shared handedness distinguishes it from independently twisting Dragon branches; it must not look like a rotating mesh.",
    "color": [
      0.9412,
      0.9647,
      1.0
    ],
    "trailColor": [
      0.702,
      0.8,
      0.9176
    ],
    "stars": 45,
    "speed": 15.0,
    "life": 4.0,
    "drag": 0.48,
    "gravity": 1.1,
    "tail": 1.05,
    "width": 0.14,
    "glitter": 2,
    "sound": {
      "bass": 128.0,
      "attack": 0.006,
      "decay": 1.45,
      "burn": 0.22,
      "whistle": false
    }
  },
  {
    "id": "F25",
    "name": "Magenta Wave",
    "family": "wave",
    "description": "a broad open fan of magenta spokes with repeated shallow curves.",
    "ascentBrief": "magenta head with a smooth thin gold tracer and a restrained silver highlight.",
    "explosionBrief": "a fan of stars spreads in a shallow curved volume. A brief, small lateral oscillation shapes the trails into repeated sweeps; outward movement remains dominant. The star paths relax into falling arcs as they exhaust. This is an authored interpretation of the Wave reference.",
    "soundBrief": "low clean lift, soft rising rush, a broad papery report with a warm low body, then an airy undulating burn texture. The undulation is subtle and ends with the stars.",
    "recognition": "open fan and repeated shallow sweeps distinguish it from Whirlwind's stronger angular circulation.",
    "color": [
      1.0,
      0.3255,
      0.7137
    ],
    "trailColor": [
      0.9569,
      0.7608,
      0.8588
    ],
    "stars": 46,
    "speed": 19.0,
    "life": 3.8,
    "drag": 0.46,
    "gravity": 1.25,
    "tail": 1.0,
    "width": 0.14,
    "glitter": 2,
    "sound": {
      "bass": 72.0,
      "attack": 0.025,
      "decay": 1.75,
      "burn": 0.13,
      "whistle": false
    }
  }
];

export function resolveFirework(id: string | null): FireworkDefinition {
  return FIREWORK_CATALOGUE.find(effect => effect.id === id) ?? FIREWORK_CATALOGUE[5];
}
