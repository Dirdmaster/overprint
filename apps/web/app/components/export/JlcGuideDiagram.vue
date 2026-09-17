<script setup lang="ts">
defineProps<{ step: number }>()
</script>

<template>
  <svg
    viewBox="0 0 800 420"
    role="img"
    :aria-label="
      [
        'Board finish: White, ENIG, 1 microinch gold',
        'Advanced Options: EasyEDA multi-color Silkscreen',
        'Click Gerber Viewer above the board preview',
        'Check artwork on both sides and keep exposed pads clear'
      ][step]
    "
    class="w-full bg-white text-slate-800"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g
      v-if="step === 0"
      font-family="sans-serif"
      text-anchor="middle"
    >
      <text
        x="400"
        y="65"
        font-size="26"
        fill="currentColor"
      >
        Board finish
      </text>
      <g
        v-for="(label, index) in ['White', 'ENIG', '1 µin gold']"
        :key="label"
        :transform="`translate(${55 + index * 240}, 110)`"
      >
        <rect
          width="210"
          height="220"
          rx="16"
          fill="#f5f7fa"
          stroke="#dae1e9"
        />
        <circle
          cx="105"
          cy="80"
          r="36"
          :fill="index === 0 ? '#fff' : '#d3ad50'"
          stroke="#adb7c5"
        />
        <path
          v-if="index === 1"
          d="M81 80l16 16 33-35"
          fill="none"
          stroke="#fff"
          stroke-width="6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          x="105"
          y="152"
          font-size="23"
          font-weight="600"
          fill="#263244"
        >
          {{ label }}
        </text>
        <text
          x="105"
          y="185"
          font-size="15"
          fill="#617087"
        >
          {{ ['PCB color', 'Surface finish', 'Gold thickness'][index] }}
        </text>
      </g>
    </g>
    <g
      v-else-if="step === 1"
      font-family="sans-serif"
    >
      <text
        x="70"
        y="80"
        font-size="26"
        fill="currentColor"
      >
        Advanced Options
      </text>
      <rect
        x="70"
        y="125"
        width="660"
        height="170"
        rx="16"
        fill="#f5f7fa"
        stroke="#dae1e9"
      />
      <circle
        cx="125"
        cy="210"
        r="20"
        fill="#fff"
        stroke="#2782ee"
        stroke-width="3"
      />
      <circle
        cx="125"
        cy="210"
        r="11"
        fill="#2782ee"
      />
      <text
        x="170"
        y="204"
        font-size="23"
        font-weight="600"
        fill="#263244"
      >
        EasyEDA multi-color Silkscreen
      </text>
      <g
        v-for="(color, index) in ['#fc7f9e', '#36bba8', '#f4c953', '#557ddb']"
        :key="color"
      >
        <rect
          :x="170 + index * 40"
          y="228"
          width="28"
          height="12"
          rx="3"
          :fill="color"
        />
      </g>
      <text
        x="70"
        y="350"
        font-size="18"
        fill="#617087"
      >
        Select this option after choosing the board finish.
      </text>
    </g>
    <g
      v-else-if="step === 2"
      font-family="sans-serif"
    >
      <rect
        x="40"
        y="35"
        width="720"
        height="350"
        rx="16"
        fill="#f5f7fa"
        stroke="#dae1e9"
      />
      <text
        x="70"
        y="78"
        font-size="22"
        font-weight="600"
        fill="#263244"
      >
        Online PCB Quote
      </text>
      <text
        x="420"
        y="125"
        font-size="17"
        fill="#617087"
      >
        Re-Upload
      </text>
      <rect
        x="535"
        y="95"
        width="195"
        height="46"
        rx="8"
        fill="#fff"
        stroke="#2782ee"
        stroke-width="3"
      />
      <path
        d="M550 111h12v15h-12z M560 121l8 8"
        fill="none"
        stroke="#263244"
        stroke-width="2"
      />
      <text
        x="578"
        y="125"
        font-size="19"
        fill="#263244"
      >
        Gerber Viewer
      </text>
      <rect
        x="70"
        y="160"
        width="390"
        height="175"
        rx="12"
        fill="#287637"
      />
      <g fill="#f5f7fa">
        <circle
          cx="90"
          cy="180"
          r="7"
        />
        <circle
          cx="440"
          cy="180"
          r="7"
        />
        <circle
          cx="90"
          cy="315"
          r="7"
        />
        <circle
          cx="440"
          cy="315"
          r="7"
        />
      </g>
      <path
        d="M110 275l85-75 55 60 55-35 105 75 M130 300h240"
        fill="none"
        stroke="#f5f7fa"
        stroke-width="5"
      />
      <path
        d="M620 260V163 M607 182l13-19 13 19"
        fill="none"
        stroke="#e5484d"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <text
        x="620"
        y="295"
        text-anchor="middle"
        font-size="21"
        font-weight="600"
        fill="#263244"
      >
        Click here
      </text>
      <text
        x="265"
        y="365"
        text-anchor="middle"
        font-size="16"
        fill="#617087"
      >
        Normal quote preview
      </text>
    </g>
    <g
      v-else
      font-family="sans-serif"
      text-anchor="middle"
    >
      <text
        x="400"
        y="60"
        font-size="26"
        fill="currentColor"
      >
        Gerber Viewer
      </text>
      <g
        v-for="(label, index) in ['Front', 'Back']"
        :key="label"
        :transform="`translate(${65 + index * 365}, 100)`"
      >
        <rect
          width="300"
          height="215"
          rx="18"
          fill="#273931"
        />
        <circle
          cx="23"
          cy="23"
          r="8"
          fill="#fff"
        />
        <circle
          cx="277"
          cy="192"
          r="8"
          fill="#fff"
        />
        <path
          :d="index === 0 ? 'M50 75h75v70H50z' : 'M200 65l50 80h-100z'"
          :fill="index === 0 ? '#fc7f9e' : '#36bba8'"
        />
        <g
          v-for="pad in 4"
          :key="pad"
        >
          <rect
            :x="145 + pad * 25"
            y="170"
            width="14"
            height="22"
            rx="2"
            fill="#d3ad50"
          />
        </g>
        <text
          x="150"
          y="250"
          font-size="22"
          fill="#263244"
        >
          {{ label }}
        </text>
      </g>
      <text
        x="400"
        y="390"
        font-size="17"
        fill="#617087"
      >
        Check placement, both sides, and exposed pad clearances.
      </text>
    </g>
  </svg>
</template>
