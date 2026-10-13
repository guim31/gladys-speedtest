# Changelog

Notable changes of the Speedtest.net integration. Releases are cut by the
Release workflow; their GitHub release carries the full notes.

## [Unreleased]

### Changed

- Quieter logs: an automatic test writes nothing at the default level any
  more (its server and result move to debug), and a test that keeps failing
  (connection down for hours) is logged once when it starts failing and once
  when it works again, instead of every hour. Start the container with
  `LOG_LEVEL=debug` to see every test.
- Integration SDK 0.15 and up-to-date dependencies.

### Fixed

- Adding the Speedtest device in Gladys now fills its four sensors right away
  with the last result, instead of leaving them empty until the next test.
- The device now says explicitly that Gladys must not poll it
  (`should_poll: false`): the tests keep running on the integration's own
  schedule, as before.

## [1.3.0] - 2026-10-11

### Changed

- **Internet speed** widget, reworked for phones and narrow columns:
  - two tiles side by side, download and upload, instead of four tiles that
    left jitter alone on a second line; ping and jitter move to the status
    rows, next to the last test and the server;
  - no figure is cut any more: speeds are whole Mb/s (717 Mb/s), and Gb/s
    with one decimal in the user's format beyond 1,000 Mb/s (1,2 Gb/s), whole
    Gb/s from 10 Gb/s; ping
    and jitter keep one decimal (14,5 ms);
  - the history chart is drawn as areas, for both settings (speeds and
    latency).
- Only the widget display rounds: the values published to Gladys, and their
  history, are unchanged.
