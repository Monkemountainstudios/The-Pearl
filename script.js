/*
  THE PEARL — V1.11 visual engine prototype

*/

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });

const colourSlider = document.getElementById("colourRate");
const waterSlider = document.getElementById("waterRate");
const colourValue = document.getElementById("colourValue");
const waterValue = document.getElementById("waterValue");
const startButton = document.getElementById("startButton");
const clearButton = document.getElementById("clearButton");
const soundModeBtn = document.getElementById("soundModeBtn");

let bonkersMode = false;

soundModeBtn.addEventListener("click", () => {

    bonkersMode = !bonkersMode;

    if (bonkersMode) {
        currentSoundSet = SOUNDSETS.bonkers;
        soundModeBtn.textContent = "Bonkers";
    } else {
        currentSoundSet = SOUNDSETS.sane;
        soundModeBtn.textContent = "Sane";
    }

});

const PAPER = { r: 255, g: 252, b: 236 };

const palette = [
  { name: "blue",        r: 62,  g: 111, b: 190 },
  { name: "light green", r: 101, g: 177, b: 135 },
  { name: "red",         r: 197, g: 83,  b: 78  },
  { name: "violet",      r: 130, g: 93,  b: 177 },
  { name: "pink",        r: 218, g: 121, b: 151 },
  { name: "green",       r: 74,  g: 145, b: 94  },
  { name: "yellow",      r: 221, g: 184, b: 72  },
  { name: "orange",      r: 212, g: 128, b: 69  },
  { name: "brown",       r: 245, g: 245, b: 232  },
  { name: "hotpink",     r: 255, g: 2, b: 127  },
  { name: "pearl",       r: 255, g: 255, b: 232  },
  { name: "flarn",       r: 12, g: 42, b: 35  },
  { name: "teal",        r: 063,  g: 157, b: 156 }
];

// Simulation dimensions are intentionally modest.
// Rendering stretches this smoothly across the visible paper.
let GRID_W = 480;
let GRID_H = 300;
let CELL_COUNT = GRID_W * GRID_H;

// Pigment stores additive amounts of each channel plus density.
let pr, pg, pb, pigment, water;
let stainPr, stainPg, stainPb, stain;
let nextPr, nextPg, nextPb, nextPigment, nextWater;
let paperAbsorbency;
let flowX, flowY;

let running = false;
let colourTimer = 0;
let waterTimer = 0;
let lastFrame = performance.now();
let accumulator = 0;

const SIM_DT = 1 / 30; // fixed 30 Hz simulation

let imageCanvas = document.createElement("canvas");
let imageCtx = imageCanvas.getContext("2d");
let imageData;

let session = makeSessionCharacter();

/* =======================================================
   AUDIO ENGINE
======================================================= */

let audioCtx = null;

let colourBuffer = null;
let waterBuffer = null;

let masterGain = null;
let masterHPF = null;
let compressor = null;

let reverbBuses = [];

let audioReady = false;


const SOUNDSETS = {
    sane: {
        colour: "audio/c.ogg",
        water: "audio/c_reverse.ogg"
    },

    bonkers: {
        colour: "audio/fuap.ogg",
        water: "audio/pop.ogg"
    }
};

let saneColourBuffer = null;
let saneWaterBuffer = null;
let bonkersColourBuffer = null;
let bonkersWaterBuffer = null;
/*
    The sample is a C.

    MIDI 60 = middle C.
*/
const SOURCE_MIDI = 60;


const scales = {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
	pentatonic: [0, 2, 4, 7, 9],
	ragatodi:	[0, 1, 3, 6, 7, 9, 10, 11],
	wholetone:  [0, 2, 4, 6, 8, 10]
};
let currentScale = scales.minor;

const scaleSelect = document.getElementById("scaleSelect");

scaleSelect.addEventListener("change", () => {

    currentScale = scales[scaleSelect.value];

});

/*
    Four octaves of usable notes.
*/

const OCTAVE_COUNT = 4;


/* -------------------------------------------------------
   AUDIO INITIALISATION
------------------------------------------------------- */

async function initAudio() {

    if (audioReady) {

        if (
            audioCtx &&
            audioCtx.state === "suspended"
        ) {
            await audioCtx.resume();
        }

        return;
    }


    audioCtx =
        new (
            window.AudioContext ||
            window.webkitAudioContext
        )();


    /*
        MASTER HIGH-PASS

        Removes very low-frequency mud caused by
        strongly down-pitched samples and long reverbs.
    */

    masterHPF =
        audioCtx.createBiquadFilter();

    masterHPF.type =
        "highpass";

    masterHPF.frequency.value =
        120;

    masterHPF.Q.value =
        0.65;


    /*
        Gentle compressor merely catches piles
        of simultaneous notes.
    */

    compressor =
        audioCtx.createDynamicsCompressor();

    compressor.threshold.value =
        -18;

    compressor.knee.value =
        18;

    compressor.ratio.value =
        3;

    compressor.attack.value =
        0.025;

    compressor.release.value =
        0.45;


    masterGain =
        audioCtx.createGain();

    masterGain.gain.value =
        0.48;


    masterHPF
        .connect(compressor)
        .connect(masterGain)
        .connect(audioCtx.destination);


    /*
        Create several reverb environments.

        Every new note randomly chooses one.
    */

    reverbBuses = [

        createReverbBus(
            1.5,
            2.2
        ),

        createReverbBus(
            2.8,
            2.8
        ),

        createReverbBus(
            5.0,
            4.4
        ),

        createReverbBus(
            8.0,
            7.2
        )

    ];


    /*
        Load the two samples.
    */

const [
    saneColourResponse,
    saneWaterResponse,
    bonkersColourResponse,
    bonkersWaterResponse
] = await Promise.all([
    fetch(SOUNDSETS.sane.colour),
    fetch(SOUNDSETS.sane.water),
    fetch(SOUNDSETS.bonkers.colour),
    fetch(SOUNDSETS.bonkers.water)
]);

const [
    saneColourData,
    saneWaterData,
    bonkersColourData,
    bonkersWaterData
] = await Promise.all([
    saneColourResponse.arrayBuffer(),
    saneWaterResponse.arrayBuffer(),
    bonkersColourResponse.arrayBuffer(),
    bonkersWaterResponse.arrayBuffer()
]);

saneColourBuffer =
    await audioCtx.decodeAudioData(saneColourData);

saneWaterBuffer =
    await audioCtx.decodeAudioData(saneWaterData);

bonkersColourBuffer =
    await audioCtx.decodeAudioData(bonkersColourData);

bonkersWaterBuffer =
    await audioCtx.decodeAudioData(bonkersWaterData);

audioReady = true;


/* -------------------------------------------------------
   PROCEDURAL REVERB

   Means we don't need separate impulse-response files.
------------------------------------------------------- */

function createReverbBus(
    seconds,
    decay
) {

    const rate =
        audioCtx.sampleRate;

    const length =
        Math.floor(
            rate * seconds
        );


    const impulse =
        audioCtx.createBuffer(
            2,
            length,
            rate
        );


    for (
        let channel = 0;
        channel < 2;
        channel++
    ) {

        const data =
            impulse.getChannelData(
                channel
            );


        for (
            let i = 0;
            i < length;
            i++
        ) {

            const envelope =
                Math.pow(
                    1 - i / length,
                    decay
                );


            data[i] =
                (
                    Math.random() * 2 - 1
                ) *
                envelope;
        }
    }


    const convolver =
        audioCtx.createConvolver();

    convolver.buffer =
        impulse;


    const output =
        audioCtx.createGain();

    output.gain.value =
        0.75;


    convolver
        .connect(output)
        .connect(masterHPF);


    return {
        convolver,
        output
    };
}


/* -------------------------------------------------------
   SCALE / POSITION
------------------------------------------------------- */

function pitchFromX(xNorm) {

    /*
        xNorm:
        0 = left edge
        1 = right edge
    */

    const totalNotes =
        currentScale.length *
        OCTAVE_COUNT;


    let index =
        Math.floor(
            xNorm * totalNotes
        );


    index =
        clamp(
            index,
            0,
            totalNotes - 1
        );


    const octave =
        Math.floor(
            index /
            currentScale.length
        );


    const degree =
        index %
        currentScale.length;


    const midi =
    SOURCE_MIDI +
    currentScale[degree] +
    octave * 12
    - 24;


    return Math.pow(
        2,
        (
            midi -
            SOURCE_MIDI
        ) /
        12
    );
}


/* -------------------------------------------------------
   PLAY ONE DROP
------------------------------------------------------- */

function playDropSound(
    buffer,
    xNorm,
    yNorm,
    isWater = false
) {

    if (
        !audioReady ||
        !buffer
    ) {
        return;
    }


    const now =
        audioCtx.currentTime;


    const source =
        audioCtx.createBufferSource();

    source.buffer =
        buffer;


    /*
        X = pitch.
    */

    const playbackRate =
        pitchFromX(
            xNorm
        );

    source.playbackRate.value =
        playbackRate;


    /*
        Y = volume.

        Canvas Y runs downward:
        yNorm 0 = top
        yNorm 1 = bottom

        Top slightly louder.
        Bottom slightly quieter.

        Deliberately modest range.
    */

    const verticalVolume =
        0.42 +
        (
            1 - yNorm
        ) *
        0.24;


    /*
        Small natural level variation.
    */

    let volume =
        verticalVolume *
        randomRange(
            0.90,
            1.08
        );


    /*
        Reverse water notes slightly quieter.
    */

    if (isWater) {

        volume *=
            0.78;
    }


    const dryGain =
        audioCtx.createGain();

    const wetGain =
        audioCtx.createGain();


    /*
        Random reverb world.

        Sometimes merely healthy.
        Sometimes the Archbishop has arrived.
    */

    const reverb =
        reverbBuses[
            Math.floor(
                Math.random() *
                reverbBuses.length
            )
        ];


    const wetAmount =
        randomRange(
            0.48,
            0.78
        );


    dryGain.gain.value =
        volume *
        (
            1 -
            wetAmount * 0.42
        );


    wetGain.gain.value =
        volume *
        wetAmount;


    source
        .connect(dryGain)
        .connect(masterHPF);


    source
        .connect(wetGain)
        .connect(
            reverb.convolver
        );


    /*
        No artificial note length yet.

        Playback-rate transposition naturally changes
        duration, which is exactly what we wanted.
    */

    source.start(now);


    source.onended = () => {

        source.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
    };
}


/* -------------------------------------------------------
   SPECIFIC EVENT TYPES
------------------------------------------------------- */

function playColourNote(
    xNorm,
    yNorm
) {

    playDropSound(
        colourBuffer,
        xNorm,
        yNorm,
        false
    );
}


function playWaterNote(
    xNorm,
    yNorm
) {

    playDropSound(
        waterBuffer,
        xNorm,
        yNorm,
        true
    );
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function makeSessionCharacter() {
  return {
    spread: randomRange(0.95, 1.05),
    waterTransport: randomRange(0.94, 1.06),
    evaporation: randomRange(0.0095, 0.055),
    staining: randomRange(0.95, 1.25)
  };
}

function allocateGrid() {
  CELL_COUNT = GRID_W * GRID_H;

  pr = new Float32Array(CELL_COUNT);
  pg = new Float32Array(CELL_COUNT);
  pb = new Float32Array(CELL_COUNT);
  pigment = new Float32Array(CELL_COUNT);
  water = new Float32Array(CELL_COUNT);
  stainPr = new Float32Array(CELL_COUNT);
  stainPg = new Float32Array(CELL_COUNT);
  stainPb = new Float32Array(CELL_COUNT);
  stain = new Float32Array(CELL_COUNT);
	flowX = new Float32Array(CELL_COUNT);
	flowY = new Float32Array(CELL_COUNT);

  nextPr = new Float32Array(CELL_COUNT);
  nextPg = new Float32Array(CELL_COUNT);
  nextPb = new Float32Array(CELL_COUNT);
  nextPigment = new Float32Array(CELL_COUNT);
  nextWater = new Float32Array(CELL_COUNT);

  paperAbsorbency = new Float32Array(CELL_COUNT);

  // Fixed subtle paper texture. This affects flow, not displayed colour.
  for (let i = 0; i < CELL_COUNT; i++) {
    paperAbsorbency[i] = randomRange(0.74, 1.06);
  }

  imageCanvas.width = GRID_W;
  imageCanvas.height = GRID_H;
  imageData = imageCtx.createImageData(GRID_W, GRID_H);
}

function clearSimulation() {
  pr.fill(0);
  pg.fill(0);
  pb.fill(0);
  pigment.fill(0);
  water.fill(0);
  stainPr.fill(0);
  stainPg.fill(0);
  stainPb.fill(0);
  stain.fill(0);
	flowX.fill(0);
	flowY.fill(0);
  session = makeSessionCharacter();
  render();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  render();
}

function sliderToInterval(value) {
  if (value <= 0) return Infinity;

  const n = value / 100;
  const slowest = 600; // seconds: about 10 minutes
  const fastest = 0.22;

  return fastest * Math.pow(slowest / fastest, 1 - n);
}

function indexOf(x, y) {
  return y * GRID_W + x;
}

function addPigmentDisk(
    cx,
    cy,
    radius,
    colour,
    amount,
    wetness,
    dirX = 0,
    dirY = 0 
	) 
{
  const minX = Math.max(1, Math.floor(cx - radius - 2));
  const maxX = Math.min(GRID_W - 2, Math.ceil(cx + radius + 2));
  const minY = Math.max(1, Math.floor(cy - radius - 2));
  const maxY = Math.min(GRID_H - 2, Math.ceil(cy + radius + 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;

      const i = indexOf(x, y);
      const edge = 1 - d / radius;
      const falloff = Math.pow(edge, 0.7);
      const local = amount * falloff * randomRange(0.96, 1.04);

      pr[i] += colour.r * local;
      pg[i] += colour.g * local;
      pb[i] += colour.b * local;
      pigment[i] += local;
      water[i] = clamp(water[i] + wetness * falloff, 0, 2.5);
	  flowX[i] += dirX * falloff;
	flowY[i] += dirY * falloff;
    }
  }
}

function addWaterDisk(cx, cy, radius, amount) {
  const minX = Math.max(1, Math.floor(cx - radius - 2));
  const maxX = Math.min(GRID_W - 2, Math.ceil(cx + radius + 2));
  const minY = Math.max(1, Math.floor(cy - radius - 2));
  const maxY = Math.min(GRID_H - 2, Math.ceil(cy + radius + 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;

      const i = indexOf(x, y);
      const edge = 1 - d / radius;
      const falloff = Math.pow(edge, 0.72);
      water[i] = clamp(water[i] + amount * falloff, 0, 3.0);
    }
  }
}

function spawnColourDrop() {
  const c = palette[Math.floor(Math.random() * palette.length)];
  const strong = Math.random() < 0.06;
  const character = randomRange(-1, 1);
	const cx = randomRange(4, GRID_W - 5);
  const cy = randomRange(4, GRID_H - 5);

  const radius = randomRange(2.4, 32.6) * (1 + character * 0.05);
  const amount = strong
    ? randomRange(0.50, 1.85)
    : randomRange(0.18, 0.34);
	const directional = Math.random() < 0.12;
	const starBloom = Math.random() < 0.04;

const angle = Math.random() * Math.PI * 2;

const directionAmount = directional
    ? randomRange(0.35, 0.85)
    : 0;

const dirX = Math.cos(angle) * directionAmount;
const dirY = Math.sin(angle) * directionAmount;

  addPigmentDisk(
    cx,
    cy,
    radius,
    c,
    amount * session.staining,
    randomRange(0.45, 0.87),
    dirX,
    dirY
);

 playColourNote(
    cx / GRID_W,
    cy / GRID_H
);
	
}

function spawnWaterDrop() {
  const character = randomRange(-1, 1);
  const radius = randomRange(2.4, 22.8) * (1 + character * 0.04);
  const amount = randomRange(1.05, 1.55);
const cx = randomRange(4, GRID_W - 5);
  const cy = randomRange(4, GRID_H - 5);
  addWaterDisk(cx, cy, radius, amount);

  playWaterNote(
    cx / GRID_W,
    cy / GRID_H
);
	
}

function diffuseStep() {
  nextPr.fill(0);
  nextPg.fill(0);
  nextPb.fill(0);
  nextPigment.fill(0);
  nextWater.fill(0);

  // Conservative neighbour transport.
  // Wet cells move more pigment; dry cells mostly stain in place.
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const i = indexOf(x, y);

    let p = pigment[i];
	const w = water[i];
	const absorb = paperAbsorbency[i];

/*
    Wet pigment gradually binds to the paper.

    IMPORTANT:
    after settling, p is updated so diffusion only
    handles the pigment that is genuinely still mobile.
*/

if (p > 0.00001) {

    const settleRate =
    clamp(
        	0.0012 * absorb,
        	0.0006,
        	0.0042
    	);

    const settling =
        p * settleRate;

    if (settling > 0) {

        const cr = pr[i] / p;
        const cg = pg[i] / p;
        const cb = pb[i] / p;

        stain[i] += settling;

        stainPr[i] += cr * settling;
        stainPg[i] += cg * settling;
        stainPb[i] += cb * settling;

        pigment[i] -= settling;

        pr[i] -= cr * settling;
        pg[i] -= cg * settling;
        pb[i] -= cb * settling;

        /*
            CRITICAL:
            update the working pigment amount.
        */

        p = pigment[i];
    }
}

      // Water spreads much more readily than pigment.
      const waterMove = clamp(
        0.5 * session.spread * absorb + w * 0.012,
        0.03,
        0.15
      );

      // Pigment follows water, but a large fraction stays behind as stain.
      const pigmentMove = p > 0
  			? clamp(
      		0.15 + w * 0.017 * session.waterTransport,
      		0.003,
      		0.29
    	)
  		: 0;

     const neighbours = [
    i - 1,        // left
    i + 1,        // right
    i - GRID_W,   // up
    i + GRID_W    // down
];

/*
    Direction stored in the paper at this cell.

    Clamp it because several drops may overlap and
    otherwise build an absurdly strong directional field.
*/
const fx = clamp(flowX[i], -1, 1);
const fy = clamp(flowY[i], -1, 1);

/*
    How strongly the directional field biases pigment.

    0.0 = perfectly circular diffusion
    0.45 = noticeable but still soft
    0.8+ = increasingly streaky / violent
*/
const directionStrength = 0.45;

/*
    Give each neighbour a different weight.

    Positive fx favours right.
    Negative fx favours left.

    Positive fy favours down.
    Negative fy favours up.
*/
const leftWeight =
    1 - fx * directionStrength;

const rightWeight =
    1 + fx * directionStrength;

const upWeight =
    1 - fy * directionStrength;

const downWeight =
    1 + fy * directionStrength;

/*
    Normalize them so we're still moving exactly the
    same TOTAL amount of pigment.

    Direction changes WHERE it goes, not how much.
*/
const totalWeight =
    leftWeight +
    rightWeight +
    upWeight +
    downWeight;

const weights = [
    leftWeight / totalWeight,
    rightWeight / totalWeight,
    upWeight / totalWeight,
    downWeight / totalWeight
];


/*
    Water still spreads equally in every direction.
*/
const wShare =
    w * waterMove * 0.25;


/*
    Total pigment that leaves this cell.
*/
const movingPigment =
    p * pigmentMove;


// What remains in the current cell.
nextWater[i] +=
    w * (1 - waterMove);

nextPigment[i] +=
    p * (1 - pigmentMove);

nextPr[i] +=
    pr[i] * (1 - pigmentMove);

nextPg[i] +=
    pg[i] * (1 - pigmentMove);

nextPb[i] +=
    pb[i] * (1 - pigmentMove);


if (p > 0.00001) {

    const cr =
        pr[i] / p;

    const cg =
        pg[i] / p;

    const cb =
        pb[i] / p;


    for (
        let n = 0;
        n < neighbours.length;
        n++
    ) {

        const neighbour =
            neighbours[n];

        /*
            Water remains symmetrical.
        */
        nextWater[neighbour] +=
            wShare;

        /*
            Pigment follows our directional weighting.
        */
        const share =
            movingPigment *
            weights[n];

        nextPigment[neighbour] +=
            share;

        nextPr[neighbour] +=
            cr * share;

        nextPg[neighbour] +=
            cg * share;

        nextPb[neighbour] +=
            cb * share;
    }

} else {

    /*
        No pigment here, but water can still travel.
    */

    for (const neighbour of neighbours) {

        nextWater[neighbour] +=
            wShare;
    }
}
    }
  }

 // -------------------------------------------------------
// WATER / STAIN INTERACTION
//
// Water primarily REACTIVATES settled pigment.
// Most lifted pigment becomes mobile again and can spread.
// A very small amount is genuinely washed away.
//
// This means:
// water = blending first
//         cleaning second
// -------------------------------------------------------

for (let i = 0; i < CELL_COUNT; i++) {

    const w = nextWater[i];

    if (
        w > 0.0001 &&
        stain[i] > 0.00001
    ) {

        /*
            How much settled pigment the water lifts.

            Increase 0.0012 if water feels too weak.
            Decrease it if one water drop causes havoc.
        */

        const liftRate = clamp(
            w * 0.022,
            0,
            0.055
        );

        const lifted =
            stain[i] * liftRate;


        if (lifted > 0) {

            /*
                Remember the colour of the settled pigment
                before removing any of it.
            */

            const sr =
                stainPr[i] / stain[i];

            const sg =
                stainPg[i] / stain[i];

            const sb =
                stainPb[i] / stain[i];


            /*
                Most lifted pigment returns to the liquid
                and is free to move outward again.

                Only 6% is genuinely washed away.
            */

            const washedAway =
                lifted * 0.05;

            const remobilised =
                lifted - washedAway;


            /*
                Remove lifted pigment from the fixed stain.
            */

            stain[i] -= lifted;

            stainPr[i] -= sr * lifted;
            stainPg[i] -= sg * lifted;
            stainPb[i] -= sb * lifted;


            /*
                Put most of it back into the mobile
                pigment simulation.
            */

            nextPigment[i] += remobilised;

            nextPr[i] +=
                sr * remobilised;

            nextPg[i] +=
                sg * remobilised;

            nextPb[i] +=
                sb * remobilised;
        }
    }


    /*
        Water slowly evaporates.
    */

    nextWater[i] *= 0.9995;

    if (
        nextWater[i] < 0.0001
    ) {
        nextWater[i] = 0;
    }
}

  [pr, nextPr] = [nextPr, pr];
  [pg, nextPg] = [nextPg, pg];
  [pb, nextPb] = [nextPb, pb];
  [pigment, nextPigment] = [nextPigment, pigment];
  [water, nextWater] = [nextWater, water];
}

function updateSpawner(dt) {
  colourTimer -= dt;
  waterTimer -= dt;

  if (colourTimer <= 0) {
    const interval = sliderToInterval(Number(colourSlider.value));
    if (Number.isFinite(interval)) {
      spawnColourDrop();
      colourTimer = interval * randomRange(0.84, 1.16);
    } else {
      colourTimer = Infinity;
    }
  }

  if (waterTimer <= 0) {
    const interval = sliderToInterval(Number(waterSlider.value));
    if (Number.isFinite(interval)) {
      spawnWaterDrop();
      waterTimer = interval * randomRange(0.84, 1.16);
    } else {
      waterTimer = Infinity;
    }
  }
}

function simulate(dt) {
  updateSpawner(dt);
  diffuseStep();
}

function render() {
  if (!imageData) return;

  const pixels = imageData.data;

  for (let i = 0; i < CELL_COUNT; i++) {
    const mobileP = pigment[i];
	const fixedP = stain[i];

	const p = mobileP + fixedP;
	const w = water[i];
    const o = i * 4;

    let r = PAPER.r;
    let g = PAPER.g;
    let b = PAPER.b;

    if (p > 0.00001) {
      // Average mixed pigment colour in this cell.
      	const totalR = pr[i] + stainPr[i];
		const totalG = pg[i] + stainPg[i];
		const totalB = pb[i] + stainPb[i];

		const mixR = totalR / p;
		const mixG = totalG / p;
		const mixB = totalB / p;
		
		/*
    Small saturation enhancement.

    Keeps the translucent/pastel character,
    but stops colours looking washed grey.
*/

		const luminance =
    		mixR * 0.299 +
    		mixG * 0.587 +
    		mixB * 0.114;

		const saturationBoost = 1.28;

		const satR =
    		clamp(
        	luminance +
        	(mixR - luminance) * saturationBoost,
        	0,
        	255
    	);

		const satG =
    		clamp(
        	luminance +
        	(mixG - luminance) * saturationBoost,
        	0,
        	255
    	);

		const satB =
    		clamp(
        	luminance +
        	(mixB - luminance) * saturationBoost,
        	0,
        	255
    	);

      // Pigment concentration determines darkness/saturation.
      // Water makes the same pigment appear lighter and more transparent.
      	const density = clamp(
  			1 - Math.exp(-p * 0.88),
 			0,
  			0.84
		);
		const visualDensity = clamp(
    		density * 5.0,
    		0,
    		1.99
		);

      r = PAPER.r + (satR - PAPER.r) * visualDensity;
      g = PAPER.g + (satG - PAPER.g) * visualDensity;
      b = PAPER.b + (satB - PAPER.b) * visualDensity;
    }

    pixels[o] = Math.round(clamp(r, 0, 255));
    pixels[o + 1] = Math.round(clamp(g, 0, 255));
    pixels[o + 2] = Math.round(clamp(b, 0, 255));
    pixels[o + 3] = 255;
  }

  imageCtx.putImageData(imageData, 0, 0);

  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.imageSmoothingEnabled = true;
  const scale = Math.min(
  rect.width / imageCanvas.width,
  rect.height / imageCanvas.height
);

	const drawWidth = imageCanvas.width * scale;
	const drawHeight = imageCanvas.height * scale;

	const offsetX = (rect.width - drawWidth) / 2;
	const offsetY = (rect.height - drawHeight) / 2;

	ctx.drawImage(
    	imageCanvas,
    	offsetX,
    	offsetY,
    	drawWidth,
    	drawHeight
);
}

function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  if (running) {
    accumulator += elapsed;

    while (accumulator >= SIM_DT) {
      simulate(SIM_DT);
      accumulator -= SIM_DT;
    }

    render();
  }

  requestAnimationFrame(frame);
}

colourSlider.addEventListener("input", () => {
  colourValue.value = colourSlider.value;
  colourValue.textContent = colourSlider.value;
  colourTimer = Math.min(colourTimer, 1);
});

waterSlider.addEventListener("input", () => {
  waterValue.value = waterSlider.value;
  waterValue.textContent = waterSlider.value;
  waterTimer = Math.min(waterTimer, 1);
});

startButton.addEventListener("click", async () => {
	await initAudio();
  	running = !running;
  	startButton.textContent = running ? "Stop" : "Start";

  if (running) {
    session = makeSessionCharacter();

    if (!Number.isFinite(colourTimer) || colourTimer > 1.5) {
      colourTimer = randomRange(0.25, 1.0);
    }

    if (!Number.isFinite(waterTimer)) {
      waterTimer = sliderToInterval(Number(waterSlider.value));
    }
  }
});

clearButton.addEventListener("click", clearSimulation);
window.addEventListener("resize", resizeCanvas);

allocateGrid();
resizeCanvas();
clearSimulation();
requestAnimationFrame(frame);