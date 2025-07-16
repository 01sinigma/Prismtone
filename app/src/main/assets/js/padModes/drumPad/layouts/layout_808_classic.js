export default {
    name: "808 Classic",
    zones: [
        // Row 1
        { soundId: 45, label: "Low Tom",    image: "img/drum_icons/tom.svg",    animation: "pulse", position: { x: 5,  y: 5,  width: 20, height: 20 } },
        { soundId: 48, label: "Mid Tom",    image: "img/drum_icons/tom.svg",    animation: "pulse", position: { x: 27.5,y: 5,  width: 20, height: 20 } },
        { soundId: 50, label: "High Tom",   image: "img/drum_icons/tom.svg",    animation: "pulse", position: { x: 50,  y: 5,  width: 20, height: 20 } },
        { soundId: 49, label: "Crash",      image: "img/drum_icons/crash.svg",  animation: "flash", position: { x: 72.5,y: 5,  width: 22.5, height: 22.5 } },
        // Row 2
        { soundId: 42, label: "Closed Hat", image: "img/drum_icons/hat.svg",    animation: "shake", position: { x: 5,  y: 27.5,width: 20, height: 20 } },
        { soundId: 46, label: "Open Hat",   image: "img/drum_icons/open_hat.svg",animation: "shake", position: { x: 27.5,y: 27.5,width: 20, height: 20 } },
        { soundId: 70, label: "Maracas",    image: "img/drum_icons/shaker.svg", animation: "shake", position: { x: 50,  y: 27.5,width: 20, height: 20 } },
        { soundId: 51, label: "Ride",       image: "img/drum_icons/ride.svg",   animation: "flash", position: { x: 72.5,y: 27.5,width: 22.5, height: 22.5 } },
        // Row 3
        { soundId: 40, label: "Rimshot",    image: "img/drum_icons/rim.svg",    animation: "pulse", position: { x: 5,  y: 50,  width: 20, height: 20 } },
        { soundId: 39, label: "Clap",       image: "img/drum_icons/clap.svg",   animation: "pulse", position: { x: 27.5,y: 50,  width: 20, height: 20 } },
        { soundId: 67, label: "Agogo",      image: "img/drum_icons/cowbell.svg",animation: "shake", position: { x: 50,  y: 50,  width: 20, height: 20 } },
        { soundId: 43, label: "Floor Tom",  image: "img/drum_icons/tom.svg",    animation: "pulse", position: { x: 72.5,y: 50,  width: 22.5, height: 22.5 } },
        // Row 4 (Centered Kick and Snare)
        { soundId: 36, label: "Kick",       image: "img/drum_icons/kick.svg",   animation: "flash", position: { x: 5,  y: 72.5,width: 45, height: 22.5 } },
        { soundId: 38, label: "Snare",      image: "img/drum_icons/snare.svg",  animation: "flash", position: { x: 52.5,y: 72.5,width: 42.5, height: 22.5 } }
    ]
};
