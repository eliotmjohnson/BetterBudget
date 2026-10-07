# Navigation detail and docked strips: history

The investigations and superseded builds behind the rules in
`../navigation-detail.md`. Read a section here before reverting or reworking the
rule it explains.

## Push and pop motion

The 25% parallax was tuned by eye on device slightly below UIKit's commonly
cited 30% and well below the fixed 128 px ported from Cinalysis, which moved the
Budget layer about a third of a phone's width. Cinalysis returned the underlying
layer over 0.65 s on its softer return curve, which left the Budget layer
visibly trailing the detail and was dropped. Its 0.1 s start delay made the two
layers start out of step and read as a stutter on device, so it was removed in
favor of holding the entrance.

## Edge swipe

The direct writes replaced Cinalysis's two script smoothing stages (an input
filter plus a rAF frame driver), which trailed the finger by about 45 ms.

## Release and settle

An exponential velocity filter was dropped: on a flick of about 80 ms it never
reached the finger's speed, so the exit started slower than the finger and
looked like a hitch.

## Budget page balance strip

The strip's top shadow matched the detail header's 10% until 6.0.0, which read
as slightly too dark.
