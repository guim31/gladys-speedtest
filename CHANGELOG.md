# Changelog

Notable changes of the Speedtest.net integration. Releases are cut by the
Release workflow; their GitHub release carries the full notes.

## [Unreleased]

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
