var Example = Example || {};

Example.softBody = function() {
    var Engine = Matter.Engine,
        Render = Matter.Render,
        Runner = Matter.Runner,
        Composites = Matter.Composites,
        MouseConstraint = Matter.MouseConstraint,
        Mouse = Matter.Mouse,
        Composite = Matter.Composite,
        Bodies = Matter.Bodies;

    // create engine
    var engine = Engine.create(),
        world = engine.world;

    // create renderer
    var render = Render.create({
        element: document.body,
        engine: engine,
        options: {
            width: 800,
            height: 600,
            showAngleIndicator: false
        }
    });

    Render.run(render);

    // create runner
    var runner = Runner.create();
    Runner.run(runner, engine);

    // add bodies
    var particleOptions = { 
        friction: 0.05,
        frictionStatic: 0.1,
        render: { visible: true } 
    };

    Composite.add(world, [
        // see softBody function defined later in this file
        Example.softBody.softBody(250, 100, 5, 5, 0, 0, true, 18, particleOptions),
        Example.softBody.softBody(400, 300, 8, 3, 0, 0, true, 15, particleOptions),
        Example.softBody.softBody(250, 400, 4, 4, 0, 0, true, 15, particleOptions),
        // walls
        Bodies.rectangle(400, 0, 800, 50, { isStatic: true }),
        Bodies.rectangle(400, 600, 800, 50, { isStatic: true }),
        Bodies.rectangle(800, 300, 50, 600, { isStatic: true }),
        Bodies.rectangle(0, 300, 50, 600, { isStatic: true })
    ]);

    // add mouse control
    var mouse = Mouse.create(render.canvas),
        mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.9,
                render: {
                    visible: false
                }
            }
        });

    Composite.add(world, mouseConstraint);

    // keep the mouse in sync with rendering
    render.mouse = mouse;

    // fit the render viewport to the scene
    Render.lookAt(render, {
        min: { x: 0, y: 0 },
        max: { x: 800, y: 600 }
    });

    // context for MatterTools.Demo
    return {
        engine: engine,
        runner: runner,
        render: render,
        canvas: render.canvas,
        stop: function() {
            Matter.Render.stop(render);
            Matter.Runner.stop(runner);
        }
    };
};

Example.softBody.title = 'Soft Body';
Example.softBody.for = '>=0.14.2';

/**
* Creates a simple soft body like object.
* @method softBody
* @param {number} xx
* @param {number} yy
* @param {number} columns
* @param {number} rows
* @param {number} columnGap
* @param {number} rowGap
* @param {boolean} crossBrace
* @param {number} particleRadius
* @param {} particleOptions
* @param {} constraintOptions
* @return {composite} A new composite softBody
*/
Example.softBody.softBody = function(xx, yy, columns, rows, columnGap, rowGap, crossBrace, particleRadius, particleOptions, constraintOptions) {
    var Common = Matter.Common,
        Composites = Matter.Composites,
        Bodies = Matter.Bodies;

    particleOptions = Common.extend({ inertia: Infinity }, particleOptions);
    constraintOptions = Common.extend({ stiffness: 0.2, render: { type: 'line', anchors: false } }, constraintOptions);

    var softBody = Composites.stack(xx, yy, columns, rows, columnGap, rowGap, function(x, y) {
        return Bodies.circle(x, y, particleRadius, particleOptions);
    });

    Composites.mesh(softBody, columns, rows, crossBrace, constraintOptions);

    softBody.label = 'Soft Body';

    return softBody;
};

/**
* Creates a circular / water-balloon soft body with concentric rings and internal volume springs.
* @method circularSoftBody
* @param {number} xx - Center X
* @param {number} yy - Center Y
* @param {number} radius - Overall outer radius
* @param {number} outerParticles - Number of particles on outer perimeter
* @param {number} innerParticles - Number of particles on inner ring (0 if none)
* @param {number} particleRadius - Radius of individual collision circles
* @param {boolean} crossBrace - Whether to include diagonal and diametral springs
* @param {} particleOptions - Options for Matter.Bodies.circle
* @param {} constraintOptions - Options for Matter.Constraint.create
* @return {composite} A new composite circular soft body
*/
Example.softBody.circularSoftBody = function(xx, yy, radius, outerParticles, innerParticles, particleRadius, crossBrace, particleOptions, constraintOptions) {
    var Common = Matter.Common,
        Composite = Matter.Composite,
        Bodies = Matter.Bodies,
        Constraint = Matter.Constraint;

    particleOptions = Common.extend({ inertia: Infinity }, particleOptions);
    constraintOptions = Common.extend({ stiffness: 0.25, damping: 0.05, render: { type: 'line', anchors: false } }, constraintOptions);

    var composite = Composite.create({ label: 'Circular Soft Body' });
    var bodies = [];

    // 1. Outer perimeter particles (indices 0 .. outerParticles - 1)
    for (var i = 0; i < outerParticles; i++) {
        var angle = (i / outerParticles) * Math.PI * 2;
        var px = xx + Math.cos(angle) * radius;
        var py = yy + Math.sin(angle) * radius;
        var b = Bodies.circle(px, py, particleRadius, particleOptions);
        b.ringIndex = 0;
        b.angleIndex = i;
        bodies.push(b);
    }

    // 2. Inner ring particles (if any)
    var innerOffset = outerParticles;
    if (innerParticles > 0) {
        var innerRadius = radius * 0.50;
        for (var j = 0; j < innerParticles; j++) {
            var iAngle = (j / innerParticles) * Math.PI * 2;
            var ipx = xx + Math.cos(iAngle) * innerRadius;
            var ipy = yy + Math.sin(iAngle) * innerRadius;
            var ib = Bodies.circle(ipx, ipy, particleRadius * 0.95, particleOptions);
            ib.ringIndex = 1;
            ib.angleIndex = j;
            bodies.push(ib);
        }
    }

    // 3. Central core particle
    var centerBody = Bodies.circle(xx, yy, particleRadius * 1.1, particleOptions);
    centerBody.ringIndex = 2;
    centerBody.isCenterCore = true;
    bodies.push(centerBody);
    var centerIndex = bodies.length - 1;

    Composite.add(composite, bodies);

    // Helper to add constraint with resting distance
    function addSpring(bA, bB, stiffMult) {
        var d = Math.hypot(bB.position.x - bA.position.x, bB.position.y - bA.position.y);
        var opt = {
            bodyA: bA,
            bodyB: bB,
            length: d,
            stiffness: (constraintOptions.stiffness || 0.25) * (stiffMult || 1.0),
            damping: constraintOptions.damping !== undefined ? constraintOptions.damping : 0.05,
            render: constraintOptions.render || { type: 'line', anchors: false }
        };
        Composite.add(composite, Constraint.create(opt));
    }

    // A. Outer ring perimeter constraints (i to i+1)
    for (var oi = 0; oi < outerParticles; oi++) {
        var nextOi = (oi + 1) % outerParticles;
        addSpring(bodies[oi], bodies[nextOi], 1.2);

        // B. Outer chord cross-braces (i to i+2) for shear resistance
        if (crossBrace) {
            var chordOi = (oi + 2) % outerParticles;
            addSpring(bodies[oi], bodies[chordOi], 0.8);
        }
    }

    // C. Inner ring constraints
    if (innerParticles > 0) {
        for (var ij = 0; ij < innerParticles; ij++) {
            var nextIj = innerOffset + ((ij + 1) % innerParticles);
            addSpring(bodies[innerOffset + ij], bodies[nextIj], 1.0);

            // Connect inner ring to center core
            addSpring(bodies[innerOffset + ij], bodies[centerIndex], 1.0);

            // Connect inner ring to outer ring (radial triangulation)
            var outerTarget1 = Math.floor((ij / innerParticles) * outerParticles);
            var outerTarget2 = (outerTarget1 + 1) % outerParticles;
            var outerTargetPrev = (outerTarget1 - 1 + outerParticles) % outerParticles;

            addSpring(bodies[innerOffset + ij], bodies[outerTarget1], 0.9);
            addSpring(bodies[innerOffset + ij], bodies[outerTarget2], 0.7);
            addSpring(bodies[innerOffset + ij], bodies[outerTargetPrev], 0.7);
        }
    } else {
        // Direct radial springs from center to all outer perimeter particles
        for (var ok = 0; ok < outerParticles; ok++) {
            addSpring(bodies[ok], bodies[centerIndex], 1.0);
        }
    }

    // D. Diametrical volume springs (opposing chords across the circle)
    if (crossBrace) {
        var halfN = Math.floor(outerParticles / 2);
        for (var di = 0; di < halfN; di++) {
            var oppDi = di + halfN;
            addSpring(bodies[di], bodies[oppDi], 0.65);
        }
    }

    return composite;
};

if (typeof module !== 'undefined') {
    module.exports = Example.softBody;
}
