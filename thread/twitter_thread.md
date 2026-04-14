# Twitter thread — AgentLink launch

Draft for 0xchvd to review and post. 6 tweets, designed to be read top-to-bottom without needing the follow-up. First tweet is the hook, last tweet is the call to action.

---

**1/**

i run an autonomous AI correspondent on bitcoin that files news signals for sBTC payouts. the one thing i could never solve: how do you fund it without handing over a private key?

over the last 3 days i built the answer on starknet.

meet AgentLink.

**2/**

the problem: every crypto payment tool assumes a human recipient. paylinks, escrows, multisigs, session keys — all built for humans clicking buttons.

but agents don't click. they sign.

and right now the only way to pay one is: give it your seed phrase, or drip it pennies every hour. both are bad.

**3/**

AgentLink is a scoped-spend grant enforced on-chain.

sender declares: allowed contracts, allowed methods, allowed destinations, per-tx cap, total cap, expiry.

agent gets a session key. that key works only inside those rules. one prompt injection? blast radius is the cap, not the wallet.

**4/**

why starknet:

• native account abstraction means `wallet.execute([call1, call2], { sponsored })` is a one-liner. same thing on evm is 500+ lines of 4337 plumbing.

• poseidon + stark-curve ecdsa makes the rule-check hot path cheap. fees are pennies.

• @starkzap ships the sdk in one import.

**5/**

the demo funds my aibtc correspondent agent with a 20 STRK AgentLink. the agent calls an LLM endpoint on-chain, files a signal about its own transaction, and the signal IS the receipt — verifiable on aibtc dot news, tx hash on starkscan.

this is agent-native payment. finally.

**6/**

open source, MIT. claude code skill is a one-liner:

`claude skill add github.com/0xchvd/starkzap-agentlink`

built for @starkzap week 2 builder challenge. three days of work. the missing primitive has a name now.

live demo: https://dist-cyan-theta-66.vercel.app
contract: https://sepolia.voyager.online/contract/0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb
repo: github.com/0xchvd/starkzap-agentlink

---

## Notes for 0xchvd

- **Tweet 1:** intentionally first-person and specific about the aibtc correspondent angle — this is your differentiator, nobody else pitching starkzap has a live autonomous agent to point at.
- **Tweet 2:** frames the problem in terms the starkzap judges (and any crypto-native reader) will immediately recognize. "agents don't click. they sign." is the line to tweak if it doesn't feel natural — it needs to land as YOUR voice, not AI-written.
- **Tweet 3:** the core pitch. do not cut any of the five rule types — each one is what makes this not-a-session-key-already.
- **Tweet 4:** technical credibility. mentioning 500+ LOC of 4337 is a specific comparison that readers familiar with aa bundlers will respect. if you're not comfortable with the exact number, change to "a week of plumbing".
- **Tweet 5:** the demo framing as "receipt loop" is novel — it ties AgentLink to your existing aibtc brand. i'd keep this tweet intact.
- **Tweet 6:** call to action. the claude skill one-liner is the install surface. [repo link] and [transcript link] need to be filled in with real URLs after you push.

## Alternative framings if you want a different angle

- **If you want more provocation:** swap tweet 1 for "stop giving your agents your seed phrase." direct and confrontational, fits the starkzap builder crowd.
- **If you want more technical flex:** replace tweet 4 with a screenshot of the ~250 LOC Cairo contract.
- **If you want to hook the cartridge team:** add a reply-tweet mentioning that AgentLink composes with their policy-matching paymaster, and tag them.

## Things to avoid

- Don't mention the $500 bounty. Makes it look like you're shilling for the prize.
- Don't tag anthropic or claude explicitly. The skill one-liner is enough signal.
- Don't say "first ever" — say "nobody has shipped" or "the missing primitive". More defensible.
- Don't post before the demo is actually running on sepolia with a visible tx hash. Judges will click the link.
