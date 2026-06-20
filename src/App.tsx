import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "@studio-freight/lenis";
import "./App.css";
import { db } from "./firebase";

import { ref, push, get } from "firebase/database";

gsap.registerPlugin(ScrollTrigger);

// ─────────────────────────────────────────────
// LENIS SMOOTH SCROLL (global singleton)
// ─────────────────────────────────────────────
let lenisInstance: Lenis | null = null;

function initLenis() {
  lenisInstance = new Lenis({
    duration: 1.4,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: "vertical",
    smoothWheel: true,
  });
  lenisInstance.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenisInstance?.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);
  return lenisInstance;
}

// AUDIO
// const bgMusic = new Audio("/sounds/genie.mp3");
// bgMusic.loop =true;
// const changeSong = (src: string,startTime=0) => {
//   bgMusic.pause();

//   bgMusic.src = src;

//   bgMusic.currentTime = 0;

//   bgMusic.play().catch(err => console.log(err));
// };
// AUDIO
const bgMusic = new Audio();

bgMusic.loop = true;

let currentSong = "";

const changeSong = (src: string, startTime = 0) => {
  if (currentSong === src) return;

  currentSong = src;

  console.log("PLAYING:", src);

  bgMusic.pause();

  bgMusic.src = src;

  bgMusic.currentTime = startTime;

  bgMusic.play().catch((err) => console.log(err));
  bgMusic.onloadedmetadata = () => {
    bgMusic.currentTime = startTime;

    bgMusic
      .play()
      .then(() => console.log("PLAYING"))
      .catch((err) => console.log("ERROR", err));
  };
};
// ─────────────────────────────────────────────
// AUDIO ENGINE (Web Audio API — no assets needed)
// ─────────────────────────────────────────────
class AmbientAudio {
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;
  private running = false;

  start() {
    if (this.running) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(
      0.18,
      this.ctx.currentTime + 2,
    );
    this.masterGain.connect(this.ctx.destination);

    // Drone layer — deep pad
    this.addDrone(55, 0.3); // A1
    this.addDrone(82.4, 0.15); // E2
    this.addDrone(110, 0.1); // A2
    // Subtle high shimmer
    this.addShimmer(880, 0.04);
    this.addShimmer(1320, 0.02);
    // Pulse
    this.addPulse(220, 0.08);
    this.running = true;
  }

  private addDrone(freq: number, gain: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.Q.setValueAtTime(1, this.ctx.currentTime);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    // Slow LFO vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.3, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(1.5, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start();
    lfo.start();
    this.nodes.push(osc, g, filter, lfo, lfoGain);
  }

  private addShimmer(freq: number, gain: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    this.nodes.push(osc, g);
  }

  private addPulse(freq: number, gain: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    // Rhythmic swell every 4 seconds
    const pulse = () => {
      if (!this.ctx || !this.running) return;
      g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.5);
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2);
      setTimeout(pulse, 4000);
    };
    setTimeout(pulse, 1000);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    this.nodes.push(osc, g);
  }

  stop() {
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
    setTimeout(() => {
      this.nodes.forEach((n) => {
        try {
          (n as OscillatorNode).stop?.();
        } catch {}
      });
      this.ctx?.close();
      this.nodes = [];
      this.running = false;
    }, 1200);
  }

  isRunning() {
    return this.running;
  }
}

const audio = new AmbientAudio();

// ─────────────────────────────────────────────
// AUDIO TOGGLE BUTTON
// ─────────────────────────────────────────────
function AudioToggle() {
  const [on, setOn] = useState(false);
  const toggle = () => {
    if (on) {
      audio.stop();
      setOn(false);
    } else {
      audio.start();
      setOn(true);
    }
  };
  return (
    <button
      className="audio-toggle"
      onClick={toggle}
      title={on ? "Mute" : "Unmute ambient"}
    >
      <span className="audio-icon">{on ? "♫" : "♩"}</span>
      <span className="audio-bars">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`audio-bar bar-${i} ${on ? "active" : ""}`}
          />
        ))}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────
function ProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const scrolled =
        window.scrollY /
        (document.documentElement.scrollHeight - window.innerHeight);
      if (barRef.current) barRef.current.style.width = `${scrolled * 100}%`;
    };
    window.addEventListener("scroll", update);
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <div className="progress-bar-track">
      <div ref={barRef} className="progress-bar-fill" />
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOM CURSOR
// ─────────────────────────────────────────────
function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const isMobile = window.matchMedia("(hover: none)").matches;

  useEffect(() => {
    if (isMobile) return;
    let raf: number;
    let mx = -100,
      my = -100;
    let rx = mx,
      ry = my;

    const move = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      setVisible(true);
    };
    const leave = () => setVisible(false);
    window.addEventListener("mousemove", move);
    document.addEventListener("mouseleave", leave);

    const tick = () => {
      if (dotRef.current) {
        dotRef.current.style.left = mx + "px";
        dotRef.current.style.top = my + "px";
      }
      rx += (mx - rx) * 0.1;
      ry += (my - ry) * 0.1;
      if (ringRef.current) {
        ringRef.current.style.left = rx + "px";
        ringRef.current.style.top = ry + "px";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    const attachHover = () => {
      document
        .querySelectorAll(
          "button, a, .quiz-btn, .vault-center, .redacted, .kinetic-word",
        )
        .forEach((el) => {
          el.addEventListener("mouseenter", onEnter);
          el.addEventListener("mouseleave", onLeave);
        });
    };
    attachHover();
    const mo = new MutationObserver(attachHover);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [isMobile]);

  if (isMobile) return null;

  return (
    <div className="cursor" style={{ opacity: visible ? 1 : 0 }}>
      <div ref={dotRef} className="cursor-dot" style={{ position: "fixed" }} />
      <div
        ref={ringRef}
        className={`cursor-ring ${hovered ? "hovered" : ""}`}
        style={{ position: "fixed" }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION 1 – CINEMATIC INTRO
// ─────────────────────────────────────────────
function IntroSection() {
  const titleRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const startMusic = () => {
      changeSong("/sounds/genie.mp3", 42);
      window.removeEventListener("click", startMusic);
    };

    window.addEventListener("click", startMusic);

    return () => {
      window.removeEventListener("click", startMusic);
    };
  }, []);
  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(
      labelRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 1, delay: 0.3 },
    )
      .fromTo(
        ".intro-line-1",
        { yPercent: 110 },
        { yPercent: 0, duration: 1.2 },
        "-=0.5",
      )
      .fromTo(
        ".intro-line-2",
        { yPercent: 110 },
        { yPercent: 0, duration: 1.2 },
        "-=1.0",
      )
      .fromTo(
        subtitleRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.8 },
        "-=0.4",
      );

    // Periodic glitch
    let glitchTimer: ReturnType<typeof setTimeout>;
    const scheduleGlitch = () => {
      glitchTimer = setTimeout(
        () => {
          if (!titleRef.current) return;
          const el = titleRef.current;
          const flickers = [30, 60, 90];
          flickers.forEach((delay, i) => {
            setTimeout(() => {
              el.style.textShadow = `${(Math.random() * 8 - 4).toFixed(1)}px 0 2px rgba(232,69,69,0.9), ${(Math.random() * 8 - 4).toFixed(1)}px 0 2px rgba(46,204,138,0.9)`;
              el.style.transform = `skewX(${(Math.random() * 4 - 2).toFixed(1)}deg)`;
            }, delay);
            setTimeout(() => {
              el.style.textShadow = "0 0 80px rgba(200,169,110,0.3)";
              el.style.transform = "skewX(0deg)";
            }, delay + 50);
          });
          scheduleGlitch();
        },
        2500 + Math.random() * 2000,
      );
    };
    scheduleGlitch();

    // Parallax on scroll
    gsap.to(".intro-title", {
      yPercent: -40,
      ease: "none",
      scrollTrigger: {
        trigger: ".intro-section",
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });

    return () => clearTimeout(glitchTimer);
  }, []);

  return (
    <section className="intro-section" id="intro">
      <div className="scanlines" />
      <div className="noise" />
      <div style={{ textAlign: "center", zIndex: 4, position: "relative" }}>
        <div ref={labelRef} className="intro-label">
          [ tech stack -react,css, and my sexy brain]
        </div>
        <div ref={titleRef} className="intro-title">
          <span className="line intro-line-1">WHATSup my</span>
          <span className="line intro-line-2">HBS and HGS</span>
        </div>
        <div ref={subtitleRef} className="intro-subtitle">
          Scroll to begin the experience ↓but before that click anywhere on the
          screen
        </div>
      </div>
      <div className="intro-scroll-hint">
        <div className="scroll-line" />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 2 – WHO IS CHAYAN?
// ─────────────────────────────────────────────
function WhoSection() {
  useEffect(() => {
    ScrollTrigger.create({
      trigger: ".who-section",
      start: "top 50%",
      end: "bottom 50%",

      onEnter: () => {
        changeSong("/sounds/brampton.mp3", 30);
      },
      onLeaveBack: () => {
        changeSong("/sounds/brampton.mp3");
      },
    });
  }, []);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".who-section", start: "top 70%" },
    });
    tl.fromTo(
      ".dossier",
      { opacity: 0, y: 60 },
      { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
    )
      .fromTo(
        ".dossier-stamp",
        { opacity: 0, rotate: -5, scale: 0.5 },
        { opacity: 0.12, rotate: -15, scale: 1, duration: 0.8 },
        "-=0.4",
      )
      .fromTo(
        ".field-row",
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.5, stagger: 0.1 },
        "-=0.3",
      );
  }, []);

  const fields = [
    {
      label: "Full Name",
      value: "Chayan the stud",
      key: "name",
      redact: false,
    },
    {
      label: "Classification",
      value: "FRIEND MATERIAL — TIER S(Only for guys)",
      key: "class",
      redact: false,
    },
    {
      label: "Known Abilities",
      value:
        "University topper . Coding · Gym · Badminton · shashi tharoor se bhi achi angreji. sexy face very chiseled .part time yt teacher-full time rizzler",
      key: "abilities",
      redact: false,
    },
    {
      label: "Threat Level",
      value: revealed.threat ? "very cutie typa shii uk" : "██████████",
      key: "threat",
      redact: !revealed.threat,
    },
    {
      label: "Secret Weapon",
      value: revealed.weapon
        ? "Very sexy u may get overwhelmed by his sexiness"
        : "████████████████",
      key: "weapon",
      redact: !revealed.weapon,
    },
    {
      label: "Fun Fact",
      value: revealed.fact
        ? "I have a very cute dog ,less cute than me though"
        : "████████████████████",
      key: "fact",
      redact: !revealed.fact,
    },
  ];

  return (
    <section className="who-section">
      <div className="who-bg-text">CHAYAN</div>
      <div className="dossier">
        <div className="dossier-stamp">TOP SECRET</div>
        <div className="dossier-grid">
          {fields.map((f) => (
            <div key={f.key} className="field-row">
              <div className="field-label">{f.label}</div>
              <div className="field-value">
                {f.redact ? (
                  <span
                    className="redacted"
                    onClick={() =>
                      setRevealed((r) => ({ ...r, [f.key]: true }))
                    }
                    title="Click to declassify"
                  >
                    {f.value}
                  </span>
                ) : (
                  f.value
                )}
              </div>
            </div>
          ))}
          <div className="dossier-quote">
            "Cutie click on these white bitches i mean white-fields to reveal"
          </div>
        </div>
        {!revealed.threat && !revealed.weapon && !revealed.fact && (
          <div className="dossier-hint">
            ↑ Click the redacted fields to declassify
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 3 – GYM ARC (Horizontal Scroll)
// ─────────────────────────────────────────────
function GymSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  useEffect(() => {
    ScrollTrigger.create({
      trigger: isMobile ? ".gym-section-mobile" : ".gym-section",
      start: "top 50%",
      end: "bottom 50%",

      onEnter: () => {
        changeSong("/sounds/superman.mp3");
      },
      onEnterBack: () => {
        changeSong("/sounds/superman.mp3");
      },
    });
  }, [isMobile]);
  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track || isMobile) return;

    // Refresh ScrollTrigger after Lenis setup
    ScrollTrigger.refresh();

    const st = gsap.to(track, {
      x: () => -(track.scrollWidth - window.innerWidth),
      ease: "none",
      scrollTrigger: {
        trigger: section,
        pin: true,
        anticipatePin: 1,
        scrub: 1.5,
        start: "top top",
        end: () =>
          `+=${track.scrollWidth - window.innerWidth + window.innerHeight}`,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          // Animate bars proportionally to progress
          gsap.to(".gym-bar", {
            width: self.progress * 200,
            ease: "none",
            overwrite: "auto",
          });
        },
      },
    });

    return () => {
      st.scrollTrigger?.kill();
    };
  }, [isMobile]);

  const panels = [
    {
      cls: "gym-panel-1",
      title: ["5 DAYS / WEEK", "· NO", "EXCUSES"],
      stat: "  ",
      num: "01",
      image: "/images/abs.png",
    },
    {
      cls: "gym-panel-2",
      title: ["BUILT", "NOT", "BORN"],
      stat: "DISCIPLINE IS HIS LANGUAGE",
      num: "02",
      image: "/images/smash.png",
    },
    {
      cls: "gym-panel-3",
      title: ["idk", "why i added", "this image but it looks cool anyways"],
      stat: "CHAPTER: ONGOING",
      num: "03",
      image: "/images/fukra.png",
    },
  ];

  if (isMobile) {
    return (
      <section className="gym-section-mobile">
        {panels.map((p, i) => (
          <motion.div
            key={i}
            className={`gym-panel-mobile ${p.cls}`}
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: i * 0.1 }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <img src={p.image} alt="gym" />

            <div className="gym-number">{p.num}</div>
            <div className="gym-headline">
              {p.title.map((t, j) => (
                <span
                  key={j}
                  style={{
                    display: "block",
                    color: j === 1 ? "var(--red)" : "var(--bone)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="gym-bar" style={{ width: "120px" }} />
            <div className="gym-stat">{p.stat}</div>
          </motion.div>
        ))}
      </section>
    );
  }

  return (
    <section className="gym-section" ref={sectionRef}>
      <div className="gym-horizontal-track" ref={trackRef}>
        {panels.map((p, i) => (
          <div key={i} className={`gym-panel ${p.cls}`}>
            <div className="gym-number">{p.num}</div>
            <div style={{ zIndex: 2, textAlign: "center" }}>
              <img src={p.image} alt="gym" className="gym-bg" />

              <div className="gym-headline">
                {p.title.map((t, j) => (
                  <span
                    key={j}
                    style={{
                      display: "block",
                      color: j === 1 ? "var(--red)" : "var(--bone)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="gym-bar" />
              <div className="gym-stat">{p.stat}</div>
            </div>
            {i < panels.length - 1 && (
              <div className="gym-scroll-indicator">KEEP SCROLLING →</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 4 – CODING ARC
// ─────────────────────────────────────────────
function CodeSection() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [triggered, setTriggered] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const lines = [
    { type: "prompt", content: "cat about.json" },
    { type: "normal", content: "{" },
    { type: "key", label: '  "name"', value: '"I already told ya bbg or bbb"' },
    {
      type: "key",
      label: '  "role"',
      value: '"paise waare soche duniya jatt paida hoya bass chhaun waaste"',
    },
    {
      type: "key",
      label: '  "Tech-stack"',
      value:
        '["Next.js", "Sexy brain", "CSS(chayan sexy stud)", "Node.js","Leetcode 340+ problems solved ,"X-tcs intern"]',
    },
    { type: "key", label: '  "commits_today"', value: "47" },
    { type: "key", label: '  "coffee_dependency"', value: "true" },
    {
      type: "key",
      label: '  "ships_at"',
      value: '"When world is sleepin cause bbg im batman"',
    },
    {
      type: "comment",
      content:
        "  // warning: i have only nerdy,music,or badminton things to talk",
    },
    { type: "key", label: '  "vibe"', value: '"builds things that slap"' },
    {
      type: "key",
      label: '  "open_to"',
      value:
        '"No flings only soulmate typa shi(basically no internships i accept only permanent employment or nothing)"',
    },
    { type: "normal", content: "}" },
    { type: "prompt", content: "_" },
  ];

  useEffect(() => {
    ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top 65%",
      onEnter: () => {
        if (triggered) return;
        setTriggered(true);
        let i = 0;
        const iv = setInterval(() => {
          setVisibleLines((v) => v + 1);
          i++;
          if (i >= lines.length) clearInterval(iv);
        }, 110);
      },
      onLeaveBack: () => {
        // Reset on scroll back
        setTriggered(false);
        setVisibleLines(0);
      },
    });

    const floaters = document.querySelectorAll(".code-float-text");
    floaters.forEach((el, i) => {
      gsap.to(el, {
        y: "-=40",
        duration: 4 + i * 0.7,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: i * 0.6,
      });
    });
  }, []); // eslint-disable-line

  const floatingSnippets = [
    "const dream = () => code();",
    "while(alive) { learn(); }",
    'git commit -m "vibe check"',
    "npm run life",
    "// TODO: sleep",
    "export default Chayan;",
    "type Friend = { loyal: true }",
  ];

  return (
    <section className="code-section" ref={sectionRef}>
      <div className="code-bg-grid" />
      {floatingSnippets.map((s, i) => (
        <div
          key={i}
          className="code-float-text"
          style={{
            top: `${8 + i * 12}%`,
            left: i % 2 === 0 ? "1%" : "58%",
            opacity: 0.07,
          }}
        >
          {s}
        </div>
      ))}
      <motion.div
        className="terminal"
        initial={{ opacity: 0, y: 50, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        viewport={{ once: true, amount: 0.3 }}
      >
        <div className="terminal-bar">
          <div className="terminal-dot" style={{ background: "#ff5f57" }} />
          <div className="terminal-dot" style={{ background: "#ffbd2e" }} />
          <div className="terminal-dot" style={{ background: "#28ca41" }} />
          <span
            style={{
              marginLeft: "1rem",
              fontFamily: "var(--mono)",
              fontSize: "0.7rem",
              color: "#555",
            }}
          >
            chayan@dev — zsh
          </span>
        </div>
        <div className="terminal-body">
          {lines.slice(0, visibleLines).map((line, i) => (
            <div key={i} style={{ marginBottom: "2px" }}>
              {line.type === "prompt" && (
                <span>
                  <span className="t-prompt">❯ </span>
                  <span className="t-cmd">
                    {line.content === "_" ? "" : line.content}
                  </span>
                  {line.content === "_" && <span className="t-cursor-blink" />}
                </span>
              )}
              {line.type === "normal" && (
                <span style={{ color: "rgba(240,230,211,0.4)" }}>
                  {line.content}
                </span>
              )}
              {line.type === "comment" && (
                <span className="t-comment">{line.content}</span>
              )}
              {line.type === "key" && (
                <span>
                  <span className="t-key">{line.label}</span>
                  <span style={{ color: "#555" }}>: </span>
                  <span className="t-string">{line.value}</span>
                  <span style={{ color: "#555" }}>,</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 5 – BADMINTON ARC
// ─────────────────────────────────────────────
function BadmintonSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top 50%",
      end: "bottom 50%",

      onEnter: () => {
        console.log("BADMINTON ENTERED");
        changeSong("/sounds/sao.mp3", 120);
      },
      onLeaveBack: () => {
        changeSong("/sounds/sao.mp3");
      },
      onEnterBack: () => {
        changeSong("/sounds/sao.mp3", 120);
      },
      onLeave: () => {
        changeSong("/sounds/kaisebani.mp3", 5);
      },
    });

    return () => trigger.kill();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let W = 0,
      H = 0;
    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type Shuttle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      trail: { x: number; y: number }[];
    };
    const shuttles: Shuttle[] = [];
    const spawn = () => {
      if (shuttles.length > 25) return;
      shuttles.push({
        x: W * 0.1 + Math.random() * W * 0.8,
        y: H + 20,
        vx: (Math.random() - 0.5) * 5,
        vy: -(9 + Math.random() * 7),
        life: 0,
        maxLife: 70 + Math.random() * 50,
        trail: [],
      });
    };
    const si = setInterval(spawn, 500);
    let raf: number;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = shuttles.length - 1; i >= 0; i--) {
        const s = shuttles[i];
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 12) s.trail.shift();
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.18;
        s.life++;
        const alpha = Math.sin((s.life / s.maxLife) * Math.PI) * 0.6;
        // Draw trail
        s.trail.forEach((pt, ti) => {
          const ta = (ti / s.trail.length) * alpha * 0.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5 * (ti / s.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,169,110,${ta})`;
          ctx.fill();
        });
        // Draw head
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,169,110,${alpha})`;
        ctx.fill();
        if (s.life >= s.maxLife) shuttles.splice(i, 1);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionRef.current, start: "top 65%" },
    });
    tl.fromTo(
      ".badminton-eyebrow",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6 },
    )
      .fromTo(
        ".badminton-big .line-reveal",
        { yPercent: 100 },
        { yPercent: 0, duration: 0.9, stagger: 0.12, ease: "power3.out" },
        "-=0.2",
      )
      .fromTo(
        ".badminton-meta",
        { opacity: 0 },
        { opacity: 1, duration: 0.6 },
        "-=0.2",
      );

    return () => {
      clearInterval(si);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <section className="badminton-section" ref={sectionRef}>
      <video autoPlay muted loop playsInline className="badminton-video">
        <source src="/videos/smash.mp4" type="video/mp4" />
      </video>
      <canvas ref={canvasRef} className="shuttle-trail" />
      <div className="speed-lines" />
      <div className="badminton-content">
        <div className="badminton-eyebrow">Arc III — The Court</div>
        <div className="badminton-big">
          {[
            "Why you should hire me :",
            "Reason:1",
            "I can ",
            "play badminton or cricket with other employees so they dont get stressed ",
          ].map((word, i) => (
            <div key={i} style={{ overflow: "hidden" }}>
              <span
                className="line-reveal"
                style={
                  {
                    display: "block",
                    color: word === "MOTION" ? "var(--gold)" : "var(--bone)",
                    WebkitTextStroke:
                      word === "MASTER" ? "1px var(--gold)" : "none",
                    color2: word === "MASTER" ? "transparent" : undefined,
                  } as React.CSSProperties
                }
              >
                {word === "MASTER" ? (
                  <span
                    style={{
                      WebkitTextStroke: "1px var(--gold)",
                      color: "transparent",
                    }}
                  >
                    {word}
                  </span>
                ) : (
                  word
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="badminton-meta">please Hire me ...</div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// REASONS 1–7
// ─────────────────────────────────────────────

function Reason1() {
  useEffect(() => {
    ScrollTrigger.create({
      trigger: ".reason-1",
      start: "top 10%",
      end: "bottom 50%",
      // end:"bottom 50%",

      // onEnter: () => {
      //   changeSong("/sounds/kaisebani.mp3", 5);
      // },

      // onEnterBack: () => {
      //   changeSong("/sounds/kaisebani.mp3", 0);
      // },
    });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".reason-1", start: "top 70%" },
    });

    tl.fromTo(
      ".reason-tag-1",
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5 },
    )
      .fromTo(
        ".kinetic-word",
        { opacity: 0, y: 100, skewY: 10 },
        {
          opacity: 1,
          y: 0,
          skewY: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "power3.out",
        },
        "-=0.2",
      )
      .fromTo(
        ".reason-body-1",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.2",
      );
  }, []);

  return (
    <section className="reason-1">
      <video autoPlay muted loop playsInline className="reason-video">
        <source src="/videos/dance.mp4" type="video/mp4" />
      </video>
      <div className="reason-1-content">
        <span className="reason-tag reason-tag-1">
          Reason #02 — Why you need him in your company
        </span>
        {[
          "Reason 2 why you should hire me:",
          "i can dance on weeknd office parties",
          ".",
        ].map((w) => (
          <span key={w} className="kinetic-word">
            {w}
          </span>
        ))}
        <p className="reason-body reason-body-1"></p>
      </div>
    </section>
  );
}

function Reason2() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    ScrollTrigger.create({
      trigger: ".reason-2",

      start: "top 20%",
      end: "bottom 50%",

      onEnter: () => {
        changeSong("/sounds/superman.mp3", 0);
      },

      onEnterBack: () => {
        changeSong("/sounds/superman.mp3", 0);
      },
    });
  }, []);
  useEffect(() => {
    const section = sectionRef.current;

    if (!section) return;

    gsap.fromTo(
      ".r2-cell",
      { opacity: 0, scale: 0.8 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        stagger: { amount: 0.6, from: "center" },
        ease: "back.out(1.4)",
        scrollTrigger: { trigger: section, start: "top 65%" },
      },
    );

    const updateSpotlight = (clientX: number, clientY: number) => {
      const rect = section.getBoundingClientRect();

      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      const mask = section.querySelector(".spotlight-mask") as HTMLElement;

      if (mask) {
        mask.style.background = `radial-gradient(circle 250px at ${x}% ${y}%,
        transparent 0%,
        rgba(5,5,5,0.96) 100%)`;
      }
    };

    const handleMouse = (e: MouseEvent) => {
      updateSpotlight(e.clientX, e.clientY);
    };

    const handleTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      updateSpotlight(touch.clientX, touch.clientY);
    };

    section.addEventListener("mousemove", handleMouse);
    section.addEventListener("touchmove", handleTouch);

    return () => {
      section.removeEventListener("mousemove", handleMouse);
      section.removeEventListener("touchmove", handleTouch);
    };
  }, []);

  const traits = [
    { img: "/images/pandit.png", label: "part-tym pandit" },
    { img: "/images/abs.png", label: "6Bis" },
    { img: "/images/uni.png", label: "bharat ratna" },
    { img: "/images/dsa.png", label: "Leechad d teacher" },
    { img: "/images/yt.png", label: "YOOTOOBER" },
    { img: "/images/prom.png", label: "very professional" },
    { img: "/images/tansen.png", label: "Gaayak" },
    { img: "/images/mantri.png", label: "Rizz-mantri " },
    { img: "/images/smash.png", label: "udta panchhi" },
  ];

  return (
    <section className="reason-2" ref={sectionRef}>
      <div className="r2-title">MULTIFACETED</div>
      <div className="spotlight-mask" />
      <div className="reason-2-grid">
        {traits.map((t, i) => (
          <div key={i} className="r2-cell">
            <img src={t.img} alt={t.label} className="r2-image" />

            <div className="r2-label">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="r2-hint">tap to see hidden reasons </div>
    </section>
  );
}

function Reason3() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top 50%",
      end: "bottom 50%",

      onEnter: () => {
        console.log("BADMINTON ENTERED");
        changeSong("/sounds/tutor.mp3", 80);
      },

      onLeaveBack: () => {
        changeSong("/sounds/tutor.mp3");
      },

      onEnterBack: () => {
        changeSong("/sounds/tutor.mp3", 120);
      },
    });

    return () => trigger.kill();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let W = 0,
      H = 0;
    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type Particle = {
      x: number;
      y: number;
      ox: number;
      oy: number;
      vx: number;
      vy: number;
      r: number;
      color: string;
      life: number;
    };
    const colors = [
      "rgba(200,169,110,",
      "rgba(240,230,211,",
      "rgba(46,204,138,",
      "rgba(121,184,255,",
    ];
    const particles: Particle[] = Array.from({ length: 100 }, () => ({
      x: Math.random() * 1200,
      y: Math.random() * 900,
      ox: 0,
      oy: 0,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2 + 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: Math.random() * Math.PI * 2,
    }));

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("mousemove", onMouse);

    let raf: number;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      const mx = mouseRef.current.x,
        my = mouseRef.current.y;
      particles.forEach((p) => {
        p.life += 0.008;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        // Mouse repulsion
        const dx = p.x - mx,
          dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          p.x += (dx / dist) * 2;
          p.y += (dy / dist) * 2;
        }
        const alpha = 0.25 + Math.sin(p.life) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + alpha + ")";
        ctx.fill();
      });
      // Connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x,
            dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(200,169,110,${(1 - d / 110) * 0.1})`;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
    });
    tl.fromTo(
      ".r3-inner",
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 1, ease: "back.out(1.5)" },
    );

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return (
    <section className="reason-3 " ref={sectionRef}>
      <img src="/images/uni.png" className="reason3-bg-img" alt="" />

      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      <div className="reason-3-content">
        <div className="r3-inner">
          <span
            className="reason-tag"
            style={{
              color: "var(--gold)",
              fontFamily: "var(--mono)",
              fontSize: "0.65rem",
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "1.5rem",
            }}
          >
            Reason #03
          </span>
          <div
            style={{
              fontFamily: "var(--bebas)",
              fontSize: "clamp(3rem, 8vw, 7rem)",
              lineHeight: 0.9,
            }}
          >
            <div style={{ color: "var(--bone)" }}>
              Reason 4 of why you should hire me:
            </div>
            <div style={{ color: "var(--gold)" }}>
              5 times bharat ratna award winner{" "}
            </div>
            <div style={{ color: "var(--bone)" }}>in a row </div>
          </div>
          <p
            style={{
              fontFamily: "var(--dm)",
              fontSize: "1rem",
              color: "rgba(240,230,211,0.6)",
              marginTop: "2rem",
              maxWidth: "420px",
              lineHeight: 1.7,
            }}
          ></p>
        </div>
      </div>
    </section>
  );
}

function Reason4() {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ rx: 0, ry: 0 });
  const currentRef = useRef({ rx: 0, ry: 0 });

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current!;
    const rect = card.getBoundingClientRect();
    targetRef.current.rx = ((e.clientX - rect.left) / rect.width - 0.5) * 22;
    targetRef.current.ry = -((e.clientY - rect.top) / rect.height - 0.5) * 22;
    const shine = card.querySelector(".tilt-shine") as HTMLElement;
    if (shine) {
      shine.style.setProperty(
        "--mx",
        `${((e.clientX - rect.left) / rect.width) * 100}%`,
      );
      shine.style.setProperty(
        "--my",
        `${((e.clientY - rect.top) / rect.height) * 100}%`,
      );
    }
  };

  const resetMouse = () => {
    targetRef.current = { rx: 0, ry: 0 };
  };

  useEffect(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const tick = () => {
      currentRef.current.rx = lerp(
        currentRef.current.rx,
        targetRef.current.rx,
        0.08,
      );
      currentRef.current.ry = lerp(
        currentRef.current.ry,
        targetRef.current.ry,
        0.08,
      );
      if (cardRef.current) {
        cardRef.current.style.transform = `perspective(1000px) rotateY(${currentRef.current.rx}deg) rotateX(${currentRef.current.ry}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 60 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: ".reason-4", start: "top 70%" },
      },
    );

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <section className="reason-4">
      <div
        className="tilt-card"
        ref={cardRef}
        onMouseMove={handleMouse}
        onMouseLeave={resetMouse}
      >
        <div className="tilt-shine" />
        <div className="tilt-content">
          <div className="tilt-number">04</div>
          <div className="tilt-title">
            ABSURDLY
            <br />
            RELIABLE
          </div>
          <div
            style={{
              width: 40,
              height: 2,
              background: "var(--gold)",
              margin: "1.2rem 0",
            }}
          />
          <div className="tilt-body">
            You can set your clock by Chayan. Morning gym? 6AM sharp. Deadline?
            Delivered at 11:59PM with flying colors. He doesn't do "maybe" —
            only "watch me."
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.3em",
              color: "rgba(200,169,110,0.5)",
              marginTop: "2rem",
              textTransform: "uppercase",
            }}
          >
            ↗ Tilt me
          </div>
        </div>
      </div>
    </section>
  );
}

function Reason5() {
  const words = [
    "AS LOYAL AS PAKISTAN",
    "AS HONEST AS SHAMPY",
    "AS FUNNY AS SUNIL PAL",
    "AS REAL AS REAL JUICE",
    "HYPED AS LSG",
    "AS DRIVEN AS a person on wheelchair",
    "AS SOLID AS DAIRY MILK ",
    "AS RARE AS OXYGEN",
    "BUILT LIKE TWIN TOWERS 911",
    "AUTHENTIC AS POLO",
  ];

  useEffect(() => {
    gsap.fromTo(
      ".reason-5-center",
      { opacity: 0, scale: 0.8 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: "back.out(1.5)",
        scrollTrigger: { trigger: ".reason-5", start: "top 70%" },
      },
    );
  }, []);

  return (
    <section className="reason-5">
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ overflow: "hidden", width: "100%" }}>
          <div
            style={{
              display: "flex",
              animation: `${row % 2 === 0 ? "marqueeLeft" : "marqueeRight"} ${18 + row * 4}s linear infinite`,
              width: "max-content",
            }}
          >
            {[...words, ...words, ...words].map((w, i) => (
              <span
                key={i}
                className={`marquee-word ${(i + row) % 3 === 0 ? "outline" : ""}`}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="reason-5-center">
        <div className="reason-5-card">
          <div className="r5-label">Reason #05</div>
          <div className="r5-title"> reason 5 of why you should hire me</div>
        </div>
      </div>
    </section>
  );
}

function Reason6() {
  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: ".reason-6",

      start: "top 50%",
      end: "bottom 50%",

      onEnter: () => {
        changeSong("/sounds/tic.mp3", 90);
      },

      onEnterBack: () => {
        changeSong("/sounds/tic.mp3", 30);
      },
    });

    return () => trigger.kill();
  }, []);
  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".reason-6", start: "top 70%" },
    });
    tl.fromTo(
      ".r6-left",
      { xPercent: -20, opacity: 0 },
      { xPercent: 0, opacity: 1, duration: 1, ease: "power3.out" },
    )
      .fromTo(
        ".r6-right",
        { xPercent: 20, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: 1, ease: "power3.out" },
        "-=0.9",
      )
      .fromTo(
        ".r6-big .word",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.15 },
        "-=0.5",
      );
  }, []);

  return (
    <section className="reason-6">
      <div className="r6-left ">
        <video autoPlay muted loop playsInline className="r6-video">
          <source src="/videos/anchor.mp4" type="video/mp4" />
        </video>
        <div className="r6-content">
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.65rem",
              letterSpacing: "0.4em",
              color: "var(--gold)",
              textTransform: "uppercase",
              marginBottom: "1rem",
            }}
          >
            Reason #06
          </div>
          <div className="r6-big">
            {["Reason 6 of wyshm=", "i have goated Social skills", ""].map(
              (w) => (
                <div key={w} className="word">
                  {w}
                </div>
              ),
            )}
          </div>
          <div className="r6-desc">
            Chayan isn't static. He's always learning, leveling up. You don't
            just get a friend — you get a co-founder of your evolution.
          </div>
        </div>
      </div>
      <div className="r6-right">
        <video autoPlay muted loop playsInline className="r6-video">
          <source src="/videos/yt.mp4" type="video/mp4" />
        </video>
        <div className="r6-right-number">06</div>
        <div className="r6-right-content">
          <div className="r6-right-title">
            I can effectively convey my ideas &
            <br />
            connect with others on a deeper level.
          </div>
          <div className="r6-right-sub">
            Its very easy for me to EXPRESS and communicate
          </div>
        </div>
      </div>
    </section>
  );
}

function Reason7() {
  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: ".reason-7",

      start: "top 50%",
      end: "bottom 50%",

      onEnter: () => {
        console.log("REASON 7 ENTERED");
        changeSong("/sounds/goatt.mp3", 25);
      },

      onEnterBack: () => {
        console.log("REASON 7 ENTERED BACK");
        changeSong("/sounds/goatt.mp3", 30);
      },
      onLeave: () => {
        bgMusic.pause();
      },

      onLeaveBack: () => {
        bgMusic.pause();
      },
    });

    return () => trigger.kill();
  }, []);
  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".reason-7", start: "top 70%" },
    });
    tl.fromTo(
      ".neon-tag",
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5 },
    )
      .fromTo(
        ".neon-title .neon-line-inner",
        { yPercent: 100 },
        { yPercent: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" },
        "-=0.2",
      )
      .fromTo(
        ".neon-line",
        { width: 0 },
        { width: 100, duration: 0.8 },
        "-=0.3",
      )
      .fromTo(
        ".neon-desc",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.4",
      );

    // Flicker effect
    let ft: ReturnType<typeof setTimeout>;
    const flicker = () => {
      const el = document.querySelector(".neon-accent") as HTMLElement;
      if (!el) return;
      el.style.opacity = "0.3";
      setTimeout(() => {
        el.style.opacity = "1";
      }, 80);
      setTimeout(() => {
        el.style.opacity = "0.5";
      }, 160);
      setTimeout(() => {
        el.style.opacity = "1";
      }, 240);
      ft = setTimeout(flicker, 3000 + Math.random() * 4000);
    };
    ft = setTimeout(flicker, 2000);
    return () => clearTimeout(ft);
  }, []);

  return (
    <section className="reason-7">
      <img src="/images/goat.png" className="reason-7-bg" alt="" />

      <div className="neon-scanlines" />
      <div
        style={{
          textAlign: "center",
          zIndex: 2,
          position: "relative",
          padding: "2rem",
        }}
      >
        <div className="neon-tag">Reason 7</div>
        <div className="neon-title">
          {[
            "Reason 7:",
            "",
            "ZERO HALF MEASURES.IF I DO SOMETHING,I GO ALL IN.,signing off",
          ].map((line, i) => (
            <div key={i} style={{ overflow: "hidden" }}>
              <div className="neon-line-inner" style={{ display: "block" }}>
                {i === 1 ? <span className="neon-accent">{line}</span> : line}
              </div>
            </div>
          ))}
        </div>
        <div className="neon-line" />
        <p className="neon-desc"></p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 13 – FRIENDSHIP TEST
// ─────────────────────────────────────────────
const questions = [
  {
    q: "How I address my people?",
    options: ["BBG & BBB", "HBS AND HGS ", "BITCH", "BRO"],
    correct: 1,
  },
  {
    q: "mere kutte ka naam kya hai?",
    options: [
      "Sheikh hasina",
      "galaxy destroyer",
      "Baba hakim chand sabji wala",
      "pammi",
    ],
    correct: 1,
  },
  {
    q: "what i love the most?",
    options: ["cheesecake", "hoeminos", "kfc", "mcdonalds"],
    correct: 1,
  },
  {
    q: "Badminton match point. im losing 20-20. i gonna :",
    options: [
      "Panic",
      "Accept defeat gracefully",
      "Smashes harder than ever",
      "Fake an injury",
    ],
    correct: 2,
  },
  {
    q: "what i hate the most?",
    options: ["introverts", "attention seekers", "RR", "bakchodi"],
    correct: 1,
  },
];

function FriendshipTest({
  onComplete,
}: {
  onComplete: (score: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const finalScore = useRef(0);

  const answer = (idx: number) => {
    if (!name || !email) {
      alert("Enter name and email first bro 😭");
      return;
    }
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === questions[current].correct;
    const newScore = score + (correct ? 1 : 0);
    if (correct) setScore(newScore);
    finalScore.current = newScore;
    setTimeout(() => {
      if (current + 1 >= questions.length) {
        const resultData = {
          name,
          email,
          score: finalScore.current,
          percentage: (finalScore.current / questions.length) * 100,
          submittedAt: new Date().toLocaleString(),
        };

        push(ref(db, "friendshipResults"), resultData);

        setDone(true);
        onComplete(finalScore.current);
      } else {
        setCurrent((c) => c + 1);
        setSelected(null);
      }
    }, 1000);
  };

  const progress = ((current + (done ? 1 : 0)) / questions.length) * 100;

  return (
    <section className="test-section">
      <div className="test-header">
        <span className="test-tag">[ ACCESS PROTOCOL ]</span>
        <div className="test-title">
          FRIENDSHIP
          <br />
          COMPATIBILITY TEST
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          maxWidth: "600px",
          marginBottom: "20px",
        }}
      >
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="quiz-progress-track">
        <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div
            key={current}
            className="quiz-card"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="quiz-meta">
              {current + 1} / {questions.length}
            </div>
            <div className="quiz-q">{questions[current].q}</div>
            <div className="quiz-options">
              {questions[current].options.map((opt, i) => (
                <button
                  key={i}
                  className={`quiz-btn ${selected !== null ? (i === questions[current].correct ? "correct" : selected === i ? "wrong" : "dimmed") : ""}`}
                  onClick={() => answer(i)}
                >
                  <span className="quiz-opt-letter">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="quiz-card quiz-result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "backOut" }}
          >
            <div className="result-score">
              {finalScore.current}
              <span>/{questions.length}</span>
            </div>
            <div className="result-label">
              {finalScore.current >= 4
                ? "🔓 Friendship approved. You actually get it."
                : finalScore.current >= 2
                  ? "👀 Decent. You're learning. Keep scrolling."
                  : "😭 Yikes. But Chayan is forgiving. Keep going."}
            </div>
            <div className="result-sub">
              Scroll down to see your friendship score →
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 14 – FRIENDSHIP METER
// ─────────────────────────────────────────────
function FriendshipMeter({ score }: { score: number }) {
  console.log("METER RECEIVED:", score);
  const [displayed, setDisplayed] = useState(0);
  const [textVisible, setTextVisible] = useState(false);
  // const triggered = useRef(false);
  const pct = Math.round((score / 5) * 100);
  // SVG arc: half-circle, r=80, cx=100 cy=100, from (20,100) to (180,100)
  const circumference = Math.PI * 80; // ~251.3
  const dashOffset = circumference - (circumference * displayed) / 100;

  useEffect(() => {
    console.log("PCT =", pct);

    if (pct === 0) return;

    const end = pct;
    const duration = 2000;
    const startTime = performance.now();

    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);

      setDisplayed(Math.round(ease(t) * end));

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplayed(end);
        setTextVisible(true);
      }
    };

    requestAnimationFrame(step);
  }, [pct]);
  const messages: [number, string][] = [
    [
      100,
      '"Humein iss dosti ko rishtey mai badal dena chahiye., love ju aa jiii."',
    ],
    [80, '"Almost perfect,koi na still love ju frienda love ju"'],
    [60, '"ok ok percentage, but koi ni, gulabi-dil"'],

    [
      40,
      '"Ghatiya percentage but anyways tere boards se toh zyada hi le aaye idhar congrats & no dosti,sorry"',
    ],
    [
      20,
      '"bhyyi paper thodi hain jo yahan bhi fail hora hai chal koi ni ,give it a try once more"',
    ],

    [0, '"Tu dost hai? tere jaise ghatiya dost se toh 1000 dushman sahi.."'],
  ];
  const message = (messages.find(([threshold]) => pct >= threshold) ??
    messages[4])[1];

  return (
    <section className="meter-section">
      <div
        className="meter-bg-circle"
        style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
      />
      <div
        className="meter-bg-circle"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%) scale(1.5)",
        }}
      />
      <div className="meter-label">Compatibility Analysis</div>
      <div className="meter-title">
        FRIENDSHIP
        <br />
        METER
      </div>

      <div className="gauge-container">
        <svg
          viewBox="0 0 200 110"
          style={{ width: "100%", height: "100%", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C8A96E" />
              <stop offset="100%" stopColor="#2ECC8A" />
            </linearGradient>
          </defs>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(240,230,211,0.08)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              filter: "drop-shadow(0 0 8px rgba(46,204,138,0.6))",
              transition: "none",
            }}
          />
          <text
            x="100"
            y="88"
            textAnchor="middle"
            style={{
              fontFamily: "var(--bebas)",
              fontSize: "3rem",
              fill: "var(--bone)",
            }}
          >
            {displayed}%
          </text>
          <text
            x="100"
            y="106"
            textAnchor="middle"
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.45rem",
              fill: "var(--gold)",
              letterSpacing: "0.3em",
            }}
          >
            FRIEND SCORE
          </text>
        </svg>
      </div>

      <AnimatePresence>
        {textVisible && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              fontFamily: "var(--playfair)",
              fontSize: "clamp(1rem,2.5vw,1.3rem)",
              color: "var(--gold)",
              fontStyle: "italic",
              textAlign: "center",
              marginTop: "2rem",
              maxWidth: "480px",
              lineHeight: 1.6,
              padding: "0 1rem",
            }}
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
//HALL OF FAME
function HallOfFame() {
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const snapshot = await get(ref(db, "friendshipResults"));

      if (!snapshot.exists()) return;

      const data = snapshot.val();

      const list = Object.values(data) as any[];

      list.sort((a: any, b: any) => b.percentage - a.percentage);

      setPlayers(list);
    };

    loadData();
  }, []);

  return (
    <section className="hall-section">
      <div className="hall-title">🏆 FRIENDSHIP HALL OF FAME</div>

      {players.map((p, i) => (
        <div className="hall-row" key={i}>
          <span>
            #{i + 1} {p.name}
          </span>

          <span>{p.percentage}%</span>
        </div>
      ))}
    </section>
  );
}

// ─────────────────────────────────────────────
// SECTION 15 – FINAL UNLOCK
// ─────────────────────────────────────────────
function FinalUnlock() {
  const [unlocked, setUnlocked] = useState(false);
  const [phase, setPhase] = useState<"idle" | "unlocking" | "done">("idle");
  const confettiRef = useRef<HTMLDivElement>(null);

  const spawnConfetti = useCallback(() => {
    const container = confettiRef.current;
    if (!container) return;
    const colors = [
      "#C8A96E",
      "#F0E6D3",
      "#2ECC8A",
      "#E84545",
      "#79b8ff",
      "#ff9f43",
    ];
    for (let i = 0; i < 120; i++) {
      const el = document.createElement("div");
      const size = 4 + Math.random() * 10;
      el.style.cssText = `
        position:absolute; left:${Math.random() * 100}%; top:0;
        width:${size}px; height:${size}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${Math.random() > 0.4 ? "50%" : "2px"};
        pointer-events:none;
      `;
      container.appendChild(el);
      gsap.fromTo(
        el,
        { y: 0, opacity: 1, x: 0, rotation: 0, scale: 1 },
        {
          y: window.innerHeight * 1.2,
          opacity: 0,
          x: (Math.random() - 0.5) * 700,
          rotation: Math.random() * 900 - 450,
          scale: Math.random() * 0.5 + 0.3,
          duration: 1.8 + Math.random() * 2.5,
          delay: Math.random() * 0.6,
          ease: "power1.in",
          onComplete: () => el.remove(),
        },
      );
    }
  }, []);

  const handleUnlock = () => {
    if (phase !== "idle") return;
    setPhase("unlocking");
    // Shake vault
    gsap.to(".vault-door-inner", {
      x: -8,
      duration: 0.05,
      yoyo: true,
      repeat: 7,
      ease: "none",
      onComplete: () => {
        setUnlocked(true);
        setPhase("done");
        spawnConfetti();
        setTimeout(spawnConfetti, 600);
      },
    });
  };

  return (
    <section className="final-section">
      <div
        ref={confettiRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 10,
        }}
      />

      <motion.div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "0.65rem",
          letterSpacing: "0.5em",
          color: "var(--gold)",
          textTransform: "uppercase",
          marginBottom: "2rem",
          zIndex: 2,
          position: "relative",
        }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        [ LEVEL 5 CLEARANCE GRANTED ]
      </motion.div>

      <AnimatePresence mode="wait">
        {!unlocked ? (
          <motion.div
            key="locked"
            className="vault-door"
            initial={{ opacity: 0, scale: 0.7, rotate: -5 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once: true }}
          >
            <div className="vault-door-inner">
              <div className="vault-ring vault-ring-1" />
              <div className="vault-ring vault-ring-2" />
              <div className="vault-ring vault-ring-3" />
              <motion.div
                className="vault-center"
                onClick={handleUnlock}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="vault-icon">
                  {phase === "unlocking" ? "⚡" : "🔒"}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="unlocked"
            initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 18 }}
            style={{ marginBottom: "2rem" }}
          >
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, var(--gold) 0%, #8B6914 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "5rem",
                boxShadow:
                  "0 0 100px rgba(200,169,110,0.8), 0 0 200px rgba(200,169,110,0.3)",
              }}
            >
              🔓
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="vault-label">
        {unlocked ? "— UNLOCKED —" : "— CLICK TO UNLOCK —"}
      </div>

      <AnimatePresence>
        {unlocked && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            style={{ textAlign: "center", zIndex: 2, position: "relative" }}
          >
            <div className="final-title">
              WELCOME
              <br />
              TO THE
              <br />
              <span className="gold-text">CIRCLE</span>
            </div>
            <p className="final-subtitle">
              You've scrolled through the arcs, passed the test, and earned your
              place. Chayan doesn't have many people — but the ones he has?
              They're in it for life.
            </p>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9, type: "spring" }}
              style={{
                marginTop: "3rem",
                fontFamily: "var(--mono)",
                fontSize: "0.8rem",
                letterSpacing: "0.3em",
                color: "var(--gold)",
                textTransform: "uppercase",
              }}
            >
              ✦ FRIENDSHIP UNLOCKED ✦
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              style={{
                marginTop: "1.5rem",
                fontFamily: "var(--playfair)",
                fontSize: "1.2rem",
                fontStyle: "italic",
                color: "rgba(240,230,211,0.5)",
              }}
            >
              "Not everyone gets access. You did."
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const [quizScore, setQuizScore] = useState(0);

  useEffect(() => {
    // Init Lenis smooth scroll
    const lenis = initLenis();

    // Sync ScrollTrigger with Lenis
    lenis.on("scroll", () => ScrollTrigger.update());

    // Initial refresh after mount
    const timer = setTimeout(() => ScrollTrigger.refresh(), 300);

    return () => {
      clearTimeout(timer);
      lenisInstance?.destroy();
      lenisInstance = null;
    };
  }, []);

  return (
    <>
      <Cursor />
      <ProgressBar />
      <AudioToggle />

      <IntroSection />
      <div className="section-divider" />
      <WhoSection />
      <div className="section-divider" />
      <GymSection />
      <div className="section-divider" />
      <CodeSection />
      <div className="section-divider" />
      <BadmintonSection />
      <div className="section-divider" />
      <Reason1 />
      <div className="section-divider" />
      <Reason2 />
      <div className="section-divider" />
      <Reason3 />
      <div className="section-divider" />
      <Reason4 />
      <div className="section-divider" />
      <Reason5 />
      <div className="section-divider" />
      <Reason6 />
      <div className="section-divider" />
      <Reason7 />
      <div className="section-divider" />
      <FriendshipTest onComplete={setQuizScore} />
      <div className="section-divider" />
      <FriendshipMeter score={quizScore} />
      <HallOfFame />
      <div className="section-divider" />
      <FinalUnlock />
    </>
  );
}
