# Step 0: connectivity spike

`spike.html` is a minimal two-page PeerJS test: the same page, a HOST button (makes a room code) and a JOIN box. It uses the PeerJS cloud for signaling, a reliable
ordered WebRTC data channel, STUN only (no TURN), sends 20 ping / pong round trips and logs which ICE candidate pair was chosen (`host` = same network, `srflx` = through
STUN across the internet, `relay` = a TURN relay, which this build never uses).

## Result so far (2026-10-25)

| Test | Result |
|---|---|
| PeerJS cloud signaling reachable (`https://0.peerjs.com/peerjs/id`) | yes, HTTP 200 |
| Two isolated browser profiles on ONE machine (Edge, headless, via the PeerJS cloud) | connected, 20 / 20 round trips, 0-6 ms; chosen pair host/host |
| The full game (tools/nettest, same two profiles): join by code, input, snapshots at 20 Hz, rejoin, 10-minute soak | passes |
| **Two different networks** (e.g. home Wi-Fi vs a phone hotspot) | **NOT TESTED**: it cannot be done from the machine the code was written on |

The last row is the one that decides whether STUN-only is enough. It needs a person with two networks:

1. On machine A (network 1): open `tools/netspike/spike.html` (or the hosted copy), press HOST, read the code in the log.
2. On machine B (a different network: phone hotspot, a friend's house): open the same page, type the code, press JOIN.
3. Success = `RESULT: round-trip OK (20 pings)` on B. The last log line on each side names the chosen candidate pair; `srflx` on either side proves the connection crossed
   the internet through STUN alone.
4. Try it at least once with the host behind a stricter router or carrier-grade NAT (a mobile hotspot is the usual worst case). If a connection never opens, direct
   WebRTC is not enough on that pair of networks and a TURN relay is needed: that is a decision for Josh (it is paid infrastructure), nothing in the game adds one.

The game itself (index.html) uses the same transport settings, so a pass here means a pass there.
