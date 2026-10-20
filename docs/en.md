# Speedtest.net & Cloudflare for Gladys Assistant

Measure your internet connection on a schedule, straight from Gladys, using the
worldwide network of Speedtest.net servers or Cloudflare's speed test. Every run feeds four sensors you can
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
nearby servers** to see IDs, and paste one into the **Speedtest.net server
ID** field.

## Choosing the engine

The **Test engine** field picks who you measure against. Both engines feed the
same four sensors, with the same schedule, parallel connections and
measurement time: switching keeps your device, its history and your scenes.

- **Speedtest.net** (default): a nearby server of the Speedtest.net network,
  picked automatically or pinned by its ID.
- **Cloudflare**: the closest point of presence of Cloudflare's network, the
  one behind [speed.cloudflare.com](https://speed.cloudflare.com/). No server
  to choose, no account. The widget shows it as _Cloudflare_ followed by the
  airport code of its city (_CDG_ for Paris, _FRA_ for Frankfurt…).

The Cloudflare engine can also show **your public IP address**, as Cloudflare
sees it: turn on **Show my public IP (Cloudflare)**. It then appears in the
widget and in the result of the manual test, and is kept with the last result
in the integration's storage. It is never written to the logs. Off by default.

Cloudflare measures latency on an empty request, minus the processing time its
server reports, and keeps the best of 20 samples; jitter is the mean gap
between successive samples, as with Speedtest.net. Figures from the two
engines are close but not identical: compare a line with itself, on one
engine.

## Things to know

- **A test saturates your connection while it runs.** Results are also slightly
  conservative on very fast lines, since the measurement shares CPU with the
  sandbox limits Gladys applies to integrations.
- **A test transfers real data** — several hundred MB per run on a fast line,
  whatever the engine (on a gigabit line, up to about 1.5 GB per direction with
  the default settings). If your plan has a data cap, increase the interval
  between tests or disable automatic tests and use the manual button only.
- **Cloudflare limits heavy use.** After a lot of traffic in a short time (two
  gigabit tests a few minutes apart, in our trials), it refuses large
  downloads for a while with an HTTP 429 error: the test then fails with a
  message that says so, and the next scheduled one tries again. An automatic
  test can never run more often than every 10 minutes.
- Scheduled tests follow the **Interval between tests** setting (default: one
  test per hour). The **Run a speed test now** button works at any time.

## Dashboard widget

With Gladys 5.1 or later, the integration adds an **Internet speed** widget to
the dashboard editor (**Add a widget → Speedtest.net & Cloudflare**). It
shows:

- two tiles, download and upload, side by side: whole Mb/s, or Gb/s with one
  decimal beyond 1,000 Mb/s (1.2 Gb/s);
- a history area chart of two sensors: **Chart** picks _Download and upload_
  (default) or _Ping and jitter_, **History window** the last 24 hours, the
  last week (default) or the last month;
- the ping and jitter of the last test, when it ran and the server it used
  (Speedtest.net: operator and city; Cloudflare: _Cloudflare · CDG_), your
  public IP when you asked for it, and _Test in progress_ while one runs;
- a **Run a test** button. The result shows as a notification when the test
  ends (about half a minute). Tapping it while a test already runs does not
  start another one.

Good to know:

- The chart reads the device sensors: add the device to Gladys
  (**Integrations → Speedtest.net & Cloudflare → Discovery**) for it to fill.
- The widget only rounds what it shows: Gladys keeps the measured values,
  decimals included, in the sensors and their history.
- The last result is kept by the integration across restarts. Before the
  first test, the tiles show a dash and the widget says no result is known
  yet.
- Chart intervals and the long-term history follow your Gladys settings for
  device history (data retention).

## Troubleshooting

- _Results lower than the official app_: increase **Parallel connections** (fast
  lines fill better with 6–8) or **Measurement time**.
- _Test fails_: the closest server may be down — pin a different **Server ID**,
  or clear the field to let auto-selection skip unhealthy servers. With the
  Cloudflare engine, an _HTTP 429_ error means Cloudflare is limiting your
  address for a while: lengthen the interval, or lower the measurement time.
- _The server ID does nothing_: it only applies to the Speedtest.net engine.
- _Logs_: at the default level the integration logs its start, your manual
  tests and the first failure of the automatic test (then once when it works
  again). To see every test, its server and its result, set the environment
  variable `LOG_LEVEL=debug` on the container.

This integration is an independent community project, not affiliated with or
endorsed by Ookla or Cloudflare. Speedtest® is a trademark of Ookla, LLC;
Cloudflare® is a trademark of Cloudflare, Inc.
