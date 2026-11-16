import React from "react";
export function Logo({ small = false }) {
  return (
    <svg
      className={small ? "brand-mark small" : "brand-mark"}
      viewBox="0 0 100 90"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={small ? "gold-small" : "gold"}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop stopColor="#ed9b0a" />
          <stop offset="1" stopColor="#bd6500" />
        </linearGradient>
      </defs>
      <path
        d="M10 67 35 10Q39 0 50 0T65 10L90 67H71L53 25Q50 18 47 25L29 67Z"
        fill={`url(#${small ? "gold-small" : "gold"})`}
      />
      <path d="M8 74H92L98 88H2Z" fill="#283541" />
    </svg>
  );
}
export function FactoryBackground() {
  return (
    <svg
      className="factory-art"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="#ccd7e7" opacity=".3">
        <path
          d="M0 640 240 580 550 650 920 600 1220 680 1600 610V900H0Z"
          opacity=".45"
        />
        <path d="M0 790Q350 800 650 850T1600 780V900H0Z" />
        <path d="M0 850Q400 860 700 890T1600 835V900H0Z" />
      </g>
      <g stroke="#aabbcf" strokeWidth="3" fill="#c2cede" opacity=".18">
        <g>
          <ellipse cx="1390" cy="215" rx="51" ry="17" fill="none" />
          <path d="M1339 215V502L1390 555 1441 502V215" />
          <ellipse cx="1390" cy="245" rx="51" ry="17" />
          <path
            d="M1339 320Q1390 345 1441 320M1339 400Q1390 425 1441 400M1339 480Q1390 505 1441 480M1345 510V750M1435 510V750M1345 600 1435 700M1435 600 1345 700"
            fill="none"
          />
        </g>
        <g transform="translate(110,-55)">
          <ellipse cx="1390" cy="215" rx="51" ry="17" fill="none" />
          <path d="M1339 215V502L1390 555 1441 502V215" />
          <ellipse cx="1390" cy="245" rx="51" ry="17" />
          <path
            d="M1339 320Q1390 345 1441 320M1339 400Q1390 425 1441 400M1339 480Q1390 505 1441 480M1345 510V800M1435 510V800M1345 600 1435 700M1435 600 1345 700"
            fill="none"
          />
        </g>
        <path d="M1090 620 1320 480 1330 500 1090 647Z" />
        <path
          d="M1100 640V752M1170 600V752M1240 555V750M1170 640 1240 710M1240 600 1170 700"
          fill="none"
        />
        <path d="M1270 650 1410 615 1540 650V760H1270Z" />
        <path
          d="M1300 690H1370V760H1300ZM1440 682H1500V720H1440Z"
          fill="#e1e7ef"
        />
      </g>
      <g fill="#b9c7da" opacity=".23" transform="translate(100,650)">
        <path d="M0 95H270V115H0ZM210 25H263L280 85H210Z" />
        <path d="M222 38H253L265 70H222Z" fill="#eef3fa" />
        <path d="M20 6 63 0 178 46 165 90 45 65Z" />
        <path d="M20 0 7 45 22 69 35 6Z" />
        <circle cx="45" cy="115" r="20" />
        <circle cx="85" cy="115" r="20" />
        <circle cx="240" cy="115" r="20" />
        <g fill="#eef3fa">
          <circle cx="45" cy="115" r="10" />
          <circle cx="85" cy="115" r="10" />
          <circle cx="240" cy="115" r="10" />
        </g>
      </g>
    </svg>
  );
}
