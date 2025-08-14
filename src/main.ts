/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import { fromEvent, interval, merge, from, of, } from "rxjs";
import { map, filter, scan, takeWhile, concatMap, delay, mergeMap } from "rxjs/operators";
import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";
import { not } from "rxjs/internal/util/not";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 200,
    CANVAS_HEIGHT: 400,
} as const;

const Constants = {
    TICK_RATE_MS: 500,
    SONG_NAME: "RockinRobin",
} as const;

const Note = {
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,
    TAIL_WIDTH: 10,
};

/**
 * A mapping of the "cx" values (from 20 to 80) to the corresponding color.
 * The keys are the "cx" values and the values are the corresponding colors.
 * The colors are the ones used in the SVG gradients.
 */
const colorMap: Record<number, string> = {
    20: "green",
    40: "red",
    60: "blue",
    80: "yellow"
}as const;

/** User input */

type Key = "KeyH" | "KeyJ" | "KeyK" | "KeyL";

type Event = "keydown" | "keyup" | "keypress";

/** Utility functions */

/**
 * A random number generator which provides two pure functions
 * `hash` and `scaleToRange`.  Call `hash` repeatedly to generate the
 * sequence of hashes.
 * 
 * Taken from Week 4 Applied
 */
abstract class RNG {
    // LCG using GCC's constants
    private static m = 0x80000000; // 2**31
    private static a = 1103515245;
    private static c = 12345;

    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;

    /**
     * Takes hash value and scales it to the range [-1, 1]
     */
    public static scale = (hash: number) => (2 * hash) / (RNG.m - 1) - 1;
}

/**
 * Maps a seed value to a cx value for a note.
 * 
 * This function takes a seed value, generates a hash and scales it to the
 * range [-1, 1]. It then maps the scaled value to one of the numbers in the
 * cxValues array.
 * 
 * The hash and scale functions are both deterministic and pure, so the same
 * seed will always produce the same cx value.
 * 
 * @param seed - the seed value
 * @returns the cx value for the note
 */
const getCx = (seed: number) => {
    const hashValue = RNG.hash(seed);
    const scaledValue = RNG.scale(hashValue);

    const index = Math.floor((scaledValue + 1) / 2 * 4);
    const cxValues = [20, 40, 60, 80];
    return cxValues[index]
}

// Maps a note id to the SVG circle element that represents that note.
// The circles are stored here so that they can be easily removed when
// the user plays the note.
const userPlayedNotesMap: Map<string, SVGElement> = new Map();

const createCircleNote = (note: Note, svgElem: SVGElement, samples: { [key: string]: Tone.Sampler }) => {
    const cxValue = String(getCx(note.id))
    const circle = createSvgElement(svgElem.namespaceURI,"circle", {
        r: `${Note.RADIUS}`,
        cx: `${cxValue}%`,
        cy: "0",
        style: `fill: ${colorMap[Number(cxValue)]}`,
        class: `shadow`
    });
    svgElem.appendChild(circle);
    userPlayedNotesMap.set(note.id.toString(), circle);
    ['KeyH', 'KeyJ', 'KeyK', 'KeyL'].forEach((key, index) => {
        if (cxValue === `${20 + index * 20}`) 
            addNoteToKey(key as Key, note);
    });
        moveCircle(circle, note, samples)
    }

    const addNoteToKey = (key: Key, note: Note) => {
        if (activeNotes.has(key)) {
            activeNotes.get(key)!.push(note);
        }
    };

    // Map to store active notes with their corresponding keys
    const activeNotes: Map<Key, Note[]> = new Map([
        ['KeyH', []],
        ['KeyJ', []],
        ['KeyK', []],
        ['KeyL', []]
    ]);  
    //Reference taken from Week 3 tutorial
const moveCircle = (circle: SVGElement, note: Note, samples: { [key: string]: Tone.Sampler }) => {
    const source$ = interval(10); // 10ms
    const move$ = source$.pipe(
        scan((accum_Y, _) => accum_Y + 2, 0), // Adjust speed by changing the increment value (e.g., 5 or 2)
        takeWhile(updatedY => updatedY <= Viewport.CANVAS_HEIGHT) // Ensures the circle stops at the bottom of the canvas
    );

    move$.subscribe((updatedY: number) => {
        circle.setAttribute("cy", String(updatedY));

        if (updatedY >= Viewport.CANVAS_HEIGHT){
            circle.remove()
            // If user misses the note, play a sound for a random duration
            playSound(note, samples, RNG.scale(RNG.hash(note.endTime)))
        }
    });
};


/**
 * Play a sound for a given duration.
 * If no duration is specified, default to the note's duration.
 * @param note The note to play
 * @param samples The instrument sampler map
 * @param duration The duration of the sound in seconds
 */
const playSound = (note: Note, samples: { [key: string]: Tone.Sampler }, duration?: number) => {
    const instrument = samples[note.instrument];
    instrument.triggerAttackRelease(
        Tone.Frequency(note.pitch, "midi").toNote(),
        duration || note.endTime - note.startTime,
        undefined, 
        note.velocity
    );
};

/** State processing */

//Ideas on what types to declare taken from FRP Asteroids

//Properties of the state
type State = Readonly<{
    gameEnd: boolean;
    score: number;
    highscore: number;
    multiplier: number;
    currentTime: number;
    notes: ReadonlyArray<Note>;
}>;

//Properties of an Note
type Note = Readonly<{
    id: number;
    user_played: boolean;
    instrument: string;
    velocity: number;
    pitch: number;
    startTime: number;
    endTime: number;
}>;

//Intial values of the state
const initialState: State = {
    gameEnd: false,
    score: 0,
    highscore: 0,
    multiplier: 0,
    currentTime: 0,
    notes: []
} as const;

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State) => s;

/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
    elem.setAttribute("visibility", "visible");
    elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
    elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
) => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

    /**
     * Loads a CSV file into an array of Note objects.
     *
     * Expects the CSV to have the following columns:
     * - user_played: Whether the note was played by the user
     * - instrument_name: The name of the instrument
     * - velocity: The velocity of the note (0-127)
     * - pitch: The MIDI pitch of the note
     * - start: The start time of the note in seconds
     * - end: The end time of the note in seconds
     *
     * Returns an array of Note objects
     */
const loadCSV = (csvContents: string): Note[] => {
    const lines = csvContents.split("\n").slice(1);
    return lines
        .filter(line => line.length > 0)
        .map((line, index) => {
            const [user_played, instrument_name, velocity, pitch, start, end] = line.split(",");
            return {
                id: index,
                user_played: user_played.trim() === "True",
                instrument:instrument_name.trim(),
                velocity:Number(velocity) / 127,
                pitch: Number(pitch),
                startTime:Number(start),
                endTime:Number(end)
            };
        });
    };

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main(
    csvContents: string,
    samples: { [key: string]: Tone.Sampler },
) {
    
    const notes = loadCSV(csvContents)
    
    // Convert the array of notes into an observable stream
    const note$ = from(notes).pipe(
        // For each note, create a new observable stream that emits the note
        // after a delay of the note's start time. If the note was played by the user,
        // subtract 3500 so that the circle animates on time.
        mergeMap(note => of(note)
            .pipe(note.user_played ? delay(note.startTime * 1000 - 3500 ) :
            delay(note.startTime * 1000)
        )));

    // Subscribe to the observable stream of notes. For each note, either create an
    // SVG circle to animate or play the sound. The decision is
    // based on whether the note is supposed to be played by the user or not.
    note$.subscribe(note => {
        note.user_played ? createCircleNote(note, svg, samples) : 
        playSound(note, samples);
    })




    // Canvas elements
    const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
        HTMLElement;

    const preview = document.querySelector(
        "#svgPreview",
    ) as SVGGraphicsElement & HTMLElement;
    const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
        HTMLElement;
    const container = document.querySelector("#main") as HTMLElement;

    svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
    svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);

    // Text fields
    const multiplier = document.querySelector("#multiplierText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;
    const highScoreText = document.querySelector(
        "#highScoreText",
    ) as HTMLElement;

    /** User input */

    const key$ = fromEvent<KeyboardEvent>(document, "keydown" || "keypress");
    
    /**
     * Handles key press event for user-played notes.
     * If the note is in the target zone, play the sound and remove the note from the map.
     * @param key Key that is pressed
     * @param note Note object
     */
    const handleKeyPress = (key: Key, note: Note) => {
        const circle = userPlayedNotesMap.get(note.id.toString());
        if (circle) {
            const y = parseFloat(circle.getAttribute("cy") || "0");

            // Check if the note is in the target zone
            if (isNoteInTargetZone(y)) {
                playSound(note, samples); 
                circle.remove(); 
                userPlayedNotesMap.delete(note.id.toString()); 
            }
        }
    };




    // Observables for key press events for each key
    const keyH$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code }) => code === 'KeyH')
    );
    const keyJ$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code }) => code === 'KeyJ')
    );
    const keyK$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code }) => code === 'KeyK')
    );
    const keyL$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code }) => code === 'KeyL')
    );

    // Merge all key press events into one observable
    const keys$ = merge(keyH$, keyJ$, keyK$, keyL$);

    // Subscribe to the merged observable and handle key press events
    keys$.subscribe((event: KeyboardEvent) => {
        const key = event.code as Key;
        const notesForKey = activeNotes.get(key) || [];
        notesForKey.forEach(note => handleKeyPress(key, note));
    });

    // Function to check if the note is within the target zone
const isNoteInTargetZone = (circleY: number): boolean => {
    const targetZone = 360;
    return circleY >= targetZone - 10 && circleY <= targetZone + 10;
};

    /** Determines the rate of time steps */
    const tick$ = interval(Constants.TICK_RATE_MS);

    /**
     * Renders the current state to the canvas.
     *
     * In MVC terms, this updates the View using the Model.
     *
     * @param s Current state
     */
    const render = (s: State) => {
        s
    };

    const source$ = tick$
        .pipe(scan((s: State) => ({ ...initialState}), initialState))
        .subscribe((s: State) => {
            render(s);

            if (s.gameEnd) {
                show(gameover);
            } else {
                hide(gameover);
            }
        });
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: [
            "bass-electric",
            "violin",
            "piano",
            "trumpet",
            "saxophone",
            "trombone",
            "flute",
        ], // SampleLibrary.list,
        baseUrl: "samples/",
    });

    const startGame = (contents: string) => {
        document.body.addEventListener(
            "mousedown",
            function () {
                main(contents, samples);
            },
            { once: true },
        );
    };

    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        fetch(`${baseUrl}/assets/${Constants.SONG_NAME}.csv`)
            .then((response) => response.text())
            .then((text) => startGame(text))
            .catch((error) =>
                console.error("Error fetching the CSV file:", error),
            );
    });
}
