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

## Dashboard widget

With Gladys 5.1 or later, the integration adds an **Internet speed** widget to
the dashboard editor (**Add a widget → Speedtest.net**). It shows:

- four live tiles — download, upload, ping and jitter — following the sensors
  as soon as a test publishes them;
- a history chart of two of them: **Chart** picks _Download and upload_
  (default) or _Ping and jitter_, **History window** the last 24 hours, the
  last week (default) or the last month;
- when the last test ran and the Speedtest.net server it used (operator and
  city), and _Test in progress_ while one runs;
- a **Run a test** button. The result shows as a notification when the test
  ends (about half a minute). Tapping it while a test already runs does not
  start another one.

Good to know:

- The tiles and the chart read the device sensors: add the device to Gladys
  (**Integrations → Speedtest.net → Discovery**) for them to fill.
- The date and server of the last test are kept by the integration: right
  after an update or a restart, before any test ran, the widget says so while
  the tiles still show the last values Gladys recorded.
- Chart intervals and the long-term history follow your Gladys settings for
  device history (data retention).

## Troubleshooting

- _Results lower than the official app_: increase **Parallel connections** (fast
  lines fill better with 6–8) or **Measurement time**.
- _Test fails_: the closest server may be down — pin a different **Server ID**,
  or clear the field to let auto-selection skip unhealthy servers.

This integration is an independent community project, not affiliated with or
endorsed by Ookla. Speedtest® is a trademark of Ookla, LLC.
