# Speedtest.net for Gladys Assistant

Measure your internet connection on a schedule, straight from Gladys, using the
worldwide network of Speedtest.net servers. Every run feeds four sensors you can
chart on your dashboard and use in scenes:

| Sensor       | Unit   | What it tells you                                 |
| ------------ | ------ | ------------------------------------------------- |
| **Download** | Mbit/s | How fast data reaches your home                   |
| **Upload**   | Mbit/s | How fast data leaves your home                    |
| **Ping**     | ms     | Reaction time of the connection (lower is better) |
| **Jitter**   | ms     | Stability of that reaction time (lower is better) |

Typical uses: keep an eye on what your ISP actually delivers, get notified by a
scene when the download rate drops below what you pay for, or detect that a
backup line (4G failover…) has taken over.

## How a test works

The integration talks directly to Speedtest.net infrastructure — no account, no
API key, no Ookla software installed. By default it probes the closest servers,
keeps the healthiest one, then measures latency, download and upload (about
25 seconds in total). You can pin a specific server instead: press **List
nearby servers** to see IDs, and paste one into the **Server ID** field.

## Things to know

- **A test saturates your connection while it runs.** Results are also slightly
  conservative on very fast lines, since the measurement shares CPU with the
  sandbox limits Gladys applies to integrations.
- **A test transfers real data** — several hundred MB per run on a fast line.
  If your plan has a data cap, increase the interval between tests or disable
  automatic tests and use the manual button only.
- Scheduled tests follow the **Interval between tests** setting (default: one
  test per hour). The **Run a speed test now** button works at any time.

## Troubleshooting

- _Results lower than the official app_: increase **Parallel connections** (fast
  lines fill better with 6–8) or **Measurement time**.
- _Test fails_: the closest server may be down — pin a different **Server ID**,
  or clear the field to let auto-selection skip unhealthy servers.

This integration is an independent community project, not affiliated with or
endorsed by Ookla. Speedtest® is a trademark of Ookla, LLC.
