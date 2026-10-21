
"use strict";

// ============================================
// 1. CAR AND PHYSICS SETTINGS
// ============================================

const CAR_MASS = 50;          // kg, empty car
const INITIAL_FUEL_MASS = 500; // kg
const FORCE = 5000;            // N
const TIME_STEP = 0.01;        // seconds

// Track coordinates are pixels.
// This scale makes 10 pixels represent 1 metre.
const PIXELS_PER_METRE = 10;

const CAR_RADIUS = 8;           // pixels
const FUEL_USED_PER_SECOND = 5; // kg/s while a key is held

let fuelMass = INITIAL_FUEL_MASS;
let mass = CAR_MASS + fuelMass;

let position = { x: 380, y: 92 };
let velocity = { x: 0, y: 0 };

let elapsedTime = 0;
let accumulator = 0;

let track = null;
let trackPolygon = [];

// ============================================
// 2. LOAD THE TRACK
// ============================================

async function loadTrack() {
    try {
        const baseUrl = window.location.href.endsWith("/")
            ? window.location.href
            : window.location.href + "/";

        const trackUrl = new URL(MechanicsLab.trackUrl, baseUrl);
        const response = await fetch(trackUrl);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        track = await response.json();

        const left = track.barriers.left;
        const right = track.barriers.right;

        if (!Array.isArray(left) || !Array.isArray(right) ||
            left.length < 3 || right.length < 3) {
            throw new Error("Invalid barrier data");
        }

        // Create the area between the two barriers.
        trackPolygon = [
            ...left,
            ...right.slice().reverse()
        ];

        const start = track.name === "Serpentine"
            ? { x: 45, y: 240 }
            : track.name === "Monaco Grand Prix"
                ? { x: 260, y: 390 }
                : { x: 380, y: 92 };
        position = { ...start };
        velocity = { x: 0, y: 0 };
        MechanicsLab.setStudentStatus(
            track.name + " loaded. Use W, A, S and D to drive."
        );
    } catch (error) {
        console.error("Could not load track:", error);

        MechanicsLab.setStudentStatus(
            "Could not load the selected track JSON file."
        );
    }
}

loadTrack();
MechanicsLab.onTrackChange(loadTrack);

// ============================================
// 3. PHYSICS FUNCTIONS
// ============================================

function calculateAcceleration(force, currentMass) {
    if (currentMass <= 0) return 0;

    return force / currentMass;
}

function recalculateMass() {
    fuelMass = Math.max(0, fuelMass);
    mass = CAR_MASS + fuelMass;
}

// ============================================
// 4. INPUT HELPERS
// ============================================

function isPressed(keys, key) {
    return Boolean(
        keys[key] ||
        keys[key.toLowerCase()] ||
        keys[key.toUpperCase()] ||
        keys["Key" + key.toUpperCase()]
    );
}

// ============================================
// 5. TRACK COLLISION CHECKING
// ============================================

// Returns true if a point is inside the track corridor.
function isInsideTrack(point) {
    if (trackPolygon.length < 3) return true;

    let inside = false;

    for (
        let i = 0, j = trackPolygon.length - 1;
        i < trackPolygon.length;
        j = i++
    ) {
        const a = trackPolygon[i];
        const b = trackPolygon[j];

        const crosses = (
            (a.y > point.y) !== (b.y > point.y)
        ) && (
            point.x <
            (b.x - a.x) * (point.y - a.y) /
            ((b.y - a.y) || 0.000001) + a.x
        );

        if (crosses) inside = !inside;
    }

    return inside;
}

// Keep the car inside the corridor.
// If it crosses a barrier, undo that movement and stop it.
function checkBarriers(previousPosition) {
    if (!isInsideTrack(position)) {
        position = { ...previousPosition };
        velocity = { x: 0, y: 0 };

        MechanicsLab.setStudentStatus(
            "Barrier hit! The car has stopped."
        );

        return true;
    }

    return false;
}

// ============================================
// 6. UPDATE THE CAR EACH TIME STEP
// ============================================

function physicsStep(dt, keys) {
    const previousPosition = { ...position };

    const up = isPressed(keys, "w");
    const left = isPressed(keys, "a");
    const down = isPressed(keys, "s");
    const right = isPressed(keys, "d");

    const inputX = (right ? 1 : 0) - (left ? 1 : 0);
    const inputY = (down ? 1 : 0) - (up ? 1 : 0);

    const numberOfKeys = [
        up, left, down, right
    ].filter(Boolean).length;

    // Fuel is consumed only while driving.
    if (numberOfKeys > 0 && fuelMass > 0) {
        fuelMass -= FUEL_USED_PER_SECOND * dt * numberOfKeys;
        recalculateMass();
    }

    // Acceleration in m/s², converted to pixels/s².
    const acceleration = calculateAcceleration(FORCE, mass);
    const pixelAcceleration = acceleration * PIXELS_PER_METRE;

    // Apply force independently along each axis.
    velocity.x += inputX * pixelAcceleration * dt;
    velocity.y += inputY * pixelAcceleration * dt;

    // Update position using the new velocity.
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;

    // Stop the car if it crosses a barrier.
    checkBarriers(previousPosition);

    elapsedTime += dt;

    // Update the readouts provided by index.html.
    MechanicsLab.setReadout({
        x: position.x / PIXELS_PER_METRE,
        y: position.y / PIXELS_PER_METRE,
        vx: velocity.x / PIXELS_PER_METRE,
        vy: velocity.y / PIXELS_PER_METRE
    });

    if (fuelMass <= 0) {
        MechanicsLab.setStudentStatus("Fuel empty.");
    }
}

// Use a fixed physics step for more consistent simulation.
MechanicsLab.onUpdate((dt, keys) => {
    accumulator += Math.min(dt, 0.1);

    while (accumulator >= TIME_STEP) {
        physicsStep(TIME_STEP, keys);
        accumulator -= TIME_STEP;
    }
});

// ============================================
// 7. DRAW THE CAR
// ============================================

MechanicsLab.onDraw((ctx) => {
    ctx.save();

    // Car body.
    ctx.beginPath();
    ctx.arc(
        position.x,
        position.y,
        CAR_RADIUS,
        0,
        Math.PI * 2
    );
    ctx.fillStyle = "#f4f7fb";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#202938";
    ctx.stroke();

    // Small centre marker.
    ctx.beginPath();
    ctx.arc(position.x, position.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#20c997";
    ctx.fill();

    ctx.restore();
});

// ============================================
// 8. RESET
// ============================================

function resetCar() {
    fuelMass = INITIAL_FUEL_MASS;
    mass = CAR_MASS + fuelMass;

    position = !track
        ? { x: 380, y: 92 }
        : track.name === "Serpentine"
            ? { x: 45, y: 240 }
            : track.name === "Monaco Grand Prix"
                ? { x: 260, y: 390 }
                : { x: 380, y: 92 };
    velocity = { x: 0, y: 0 };

    elapsedTime = 0;
    accumulator = 0;

    MechanicsLab.setStudentStatus(
        "Car reset. Use W, A, S and D to drive."
    );
}

MechanicsLab.onReset(resetCar);
