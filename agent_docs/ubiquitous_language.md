# Ubiquitous Language

This glossary defines the domain language evidenced by iTu's product documentation and source code. **Project**, **Flashcard Deck**, and **Flashcard** are product terms; persistence and API symbols may use implementation names such as `TaskList`, `Deck`, and `Card`.

## Product identity and access

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **iTu** | The productivity and learning platform covered by this language. | App, product |
| **User** | A person who uses iTu to manage work, routines, and learning. | Customer, member |
| **User Account** | The authenticated iTu identity and data container belonging to one **User**. | Account, profile, login |
| **Authentication Session** | A temporary authenticated context that allows a **User Account** to access iTu. | Refresh session, login session |
| **Platform** | A supported environment in which a **User** accesses iTu, such as Web, macOS, or iOS. | Client, app |
| **Sync** | The propagation of a **User Account**’s changes across supported **Platforms**. | Replication, refresh |
| **Sync Device** | A registered installation of iTu that participates in a **User Account**’s synchronization. | Client, device session |
| **Sync Mutation** | A client-submitted change to a synchronizable entity. | Outbox item, request |
| **Sync Change** | A server-recorded entity change that can be delivered to another **Sync Device**. | Event, update |
| **Sync Cursor** | A position in the ordered stream of **Sync Changes** used by a device to resume pulling. | Offset, checkpoint |
| **Sync Conflict** | A change that cannot be applied automatically because local and remote versions disagree semantically. | Collision, merge error |

## Work planning

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Project** | An outcome-oriented collection of related **Tasks**. | Task list, list, folder, goal |
| **Task** | A discrete piece of work that a **User** intends to complete. | To-do, todo, item, action |
| **Subtask** | A **Task** whose parent is another **Task**. | Child item, checklist item |
| **Section** | An ordered grouping of **Tasks** within a **Project**. | Column, group, category |
| **Tag** | A reusable label that classifies **Tasks**, **Habits**, or **Journal Entries**. | Label, keyword |
| **Priority** | A user-selected importance level for a **Task**. | Rank, urgency |
| **Due Date** | The latest intended completion time for a **Task**. | Deadline, target date |
| **Scheduled Time** | A time range reserved for working on a **Task**. | Due date, appointment |
| **Inbox** | The default capture destination for **Tasks** that have not yet been organized. | Unsorted, default project |
| **Eisenhower Matrix** | A task view that classifies **Tasks** by importance and urgency. | Priority matrix, quadrant view |
| **Task Occurrence** | One scheduled instance of a recurring **Task**. | Task repetition, recurring task |
| **Reminder** | A scheduled request to notify a **User** about a **Task**. | Alert, notification |
| **Notification** | A delivered in-product message created from a **Reminder**. | Reminder, message |
| **Trash** | The recoverable holding area for deleted **Tasks**, **Flashcard Decks**, **Flashcards**, or **Journal Entries**. | Archive, deleted items |
| **Restore** | The operation that returns an item from **Trash** to its active context. | Undo delete, recover |

## Focus work

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Focus Session** | A bounded period in which a **User** intentionally works with focused attention. | Session, timer, Pomodoro |
| **Focus Mode** | The timing behavior of a **Focus Session**, currently countdown or stopwatch. | Timer type |
| **Focus Phase** | The current work or break segment within a **Focus Session**. | Timer state, cycle |
| **Focus Preset** | A reusable timing template for **Focus Sessions**, including work and break durations. | Timer setting, routine |
| **Focus Policy** | A set of optional rules that restrict distracting apps or sites during a **Focus Session**. | Blocklist, distraction mode |
| **Focus Cycle** | One work-and-break progression within a **Focus Session**. | Round, iteration |
| **Focus Interruption** | A recorded event describing why focused work was interrupted. | Distraction, pause |
| **Focus Sound** | An audio resource that can play during a **Focus Session**. | Background sound, noise |

## Usage tracking

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Browser Activity** | A transient statement that a supported browser has a particular normalized HTTP(S) URL selected in its active tab. | Browser event, tab activity |
| **Website Usage Summary** | Website-active seconds aggregated by **Sync Device**, local calendar day, browser bundle ID, and normalized URL. | Website history, browsing history |
| **Domain Usage Summary** | A Statistics projection that combines **Website Usage Summaries** sharing the same normalized hostname. | Website Usage Summary, URL usage |
| **Browser Integration** | The Chromium extension and DSN-authenticated API path that carry **Browser Activity** directly into iTu. | Browser tracker, extension bridge |
| **Browser Extension DSN** | A rotatable secret that authorizes one or more Chromium extension installations to submit **Website Usage Summaries** for a **User Account** without a login bearer token. | API key, bearer token |

## Journal, budget, and gym

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Journal Entry** | A retained personal log whose kind is **Note** or **Weekly Review**. | Journal item, entry type |
| **Note** | A free-form **Journal Entry** containing title and Markdown content. | Memo, post |
| **Weekly Review** | A structured **Journal Entry** for a date range, with editable reflection fields and read-only activity summaries. | Weekly summary, report |
| **Journal Template** | A reusable title/body/defaults preset for a **Note** or **Weekly Review**. | Journal form, preset |
| **Journal Attachment** | File metadata and upload state associated with a **Journal Entry**. | Journal file, media item |
| **Journal Revision** | An immutable snapshot of a **Journal Entry** captured before an accepted update or restore. | Version, history item |
| **Expense** | A confirmed dated spending record owned by the Budget domain. Every Expense has an amount, category, and date; merchant, payment method, and note are optional metadata. | Budget transaction, income record |
| **Expense Category** | A user-owned, ordered classification for **Expenses** that may be archived without invalidating historical records. | Budget category, spending type |
| **Monthly Budget** | An optional overall spending limit for one calendar month, with signed remaining budget derived from actual **Expenses**. | Funding target, envelope budget |
| **Category Budget Limit** | An optional spending limit for one **Expense Category** within one **Monthly Budget**. | Assignment, category target |
| **Recurring Expense** | A user-owned expense template that becomes due by date and creates an **Expense** only after explicit confirmation. | Automatic transaction, scheduled transaction |
| **Gym Workout** | A standalone exercise aggregate with `IN_PROGRESS` or `COMPLETED` status. | Journal workout, gym session |
| **Exercise Definition** | A reusable Gym exercise definition whose presentation and unit defaults can be archived or edited. | Exercise template, movement |
| **Workout Status** | The lifecycle state of a **Gym Workout**: `IN_PROGRESS` or `COMPLETED`. | Workout phase, gym state |
| **Product Calendar** | The local calendar rule used for product dates; current rules use `Asia/Ho_Chi_Minh` while instants remain UTC. | Server timezone, display timezone |

## Habits and routines

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Habit** | A recurring behavior that a **User** intends to perform according to a schedule. | Routine, practice, goal |
| **Habit Schedule** | The recurrence rules that determine when a **Habit** is expected. | Frequency, cadence |
| **Habit Target** | The amount or condition that defines success for a **Habit Occurrence**. | Goal, quota |
| **Habit Measurement** | The form in which a **Habit Target** is tracked, such as boolean, count, duration, or quantity. | Target type, metric |
| **Habit Direction** | Whether a **Habit** is intended to be built or limited. | Type, mode |
| **Habit Occurrence** | One scheduled instance of a **Habit**. | Habit day, repetition |
| **Habit Check-in** | A user-submitted record of progress for one **Habit Occurrence**. | Habit completion, checkoff, log |
| **Habit Progress Log** | A measurement of progress toward a **Habit Target**, including progress sourced from another activity. | Check-in, habit log |
| **Habit Streak** | A consecutive sequence of schedule-compliant **Habit Occurrences**. | Streak, run, chain |
| **Habit Time Block** | A recurring local time window associated with one or more **Habits**. | Routine slot, schedule block |
| **Supporting Task** | A **Task** generated from or linked to a **Habit Occurrence**. | Habit task, task copy |
| **Habit Checklist Item** | A required or optional substep within a **Habit Occurrence**. | Subtask, checklist |
| **Commitment Policy** | Rules that determine how a missed or failed **Habit Occurrence** affects a user’s commitment. | Habit contract, penalty rule |
| **Commitment Breach** | A **Habit Occurrence** that violates its **Commitment Policy**. | Failure, miss |
| **Commitment Penalty** | A growth deduction created by a **Commitment Breach**. | Fine, punishment |

## Learning and spaced repetition

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Flashcard Deck** | A named collection of related **Flashcards**. | Deck, card set, stack |
| **Flashcard** | A prompt-and-answer learning unit used to practice recall. | Card, note, study item |
| **Review Schedule** | The per-direction spaced-repetition state that determines when a **Flashcard** is due. | Review state, card status |
| **Study Session** | A bounded study period containing one or more **Flashcard Reviews**. | Session, review session |
| **Flashcard Review** | One attempt by a **User** to recall and rate a **Flashcard** during a **Study Session**. | Repetition, quiz |
| **Review Log** | An immutable record of a completed **Flashcard Review** and its scheduling result. | Review history, attempt |
| **Spaced Repetition** | A learning method that schedules **Flashcard Reviews** at expanding intervals based on recall. | Review system, scheduler |
| **Review Direction** | The side-to-side direction in which a **Flashcard** is tested. | Card side, orientation |
| **Review Grade** | The recall assessment chosen after a **Flashcard Review**, such as Again, Hard, Good, or Easy. | Score, rating, difficulty |
| **Study Mode** | The scheduling context of a **Study Session**, currently Due or Cram. | Review type |
| **Study Feedback** | AI-generated feedback about a completed **Study Session**. | AI review, session summary |
| **Card Suggestion** | An AI-generated draft **Flashcard** proposed from source material. | Generated card, recommendation |

## AI tutoring

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **AI Tutor** | The intended adaptive learning companion that explains concepts, asks questions, and responds to a **User**’s learning needs. | Assistant, chatbot, coach |
| **Tutor Conversation** | A bounded exchange between a **User** and the **AI Tutor** about a learning topic. | Chat, session, thread |

## Growth and progression

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Growth** | iTu’s progression system for converting eligible activity into personal development and spendable rewards. | Gamification, points system |
| **Growth Profile** | A **User**’s configuration and accumulated state in **Growth**. | Growth account, stats |
| **Growth Cycle** | A bounded period used to organize **Growth** progression and resets. | Season, run |
| **Growth Reset** | A deliberate operation that reduces selected progression while preserving configured rules and history. | Restart, wipe |
| **Attribute** | A broad personal capability whose level can receive routed **Skill XP**. | Stat, trait |
| **Skill** | A focused capability that earns its own progression from eligible activity. | Ability, category |
| **Attribute Mapping** | A weighted rule that routes **Skill XP** into one or two **Attributes**. | Skill link, allocation |
| **Account XP** | Permanent progression points used to determine a **User**’s overall **Level**. | XP, total points |
| **Skill XP** | Progression points assigned to a particular **Skill**. | XP, skill points |
| **Level** | A progression rank derived from accumulated **Account XP**, **Skill XP**, or both according to context. | Rank, tier, stage |
| **Coin** | A spendable **Growth** currency used to redeem **Shop Items**. | Points, tokens, money |
| **Earning Rule** | A rule that maps an eligible source activity to XP, coins, or item awards. | Reward rule, scoring rule |
| **Reward Preset** | A named configuration of default **Earning Rules**. | Difficulty, multiplier |
| **Growth Award** | The XP, coins, or items granted when an eligible activity satisfies an **Earning Rule**. | Reward, points |
| **Growth Receipt** | A user-facing summary of the **Growth Awards** produced by one activity. | Confirmation, transaction |
| **Growth Ledger Entry** | An append-only record of a change to XP or coins. | Transaction, history item |
| **Reversal** | A counter-entry that negates a previous **Growth Award** or ledger change. | Refund, undo |
| **Shop Item** | A user-defined reward that can be earned or listed for purchase in the **Growth Shop**. | Reward, prize, item |
| **Item Category** | A named grouping of **Shop Items**. | Reward group, collection |
| **Inventory** | The quantities of **Shop Items** currently held by a **User**. | Collection, stash |
| **Inventory Transaction** | An append-only record of an **Inventory** quantity change. | Item transaction, stock movement |
| **Redemption** | A completed exchange of **Coins** for a **Shop Item**. | Purchase, checkout |
| **Achievement** | A named milestone that is unlocked when a **User** satisfies its criteria. | Badge, trophy, award |

## Relationships

- A **User Account** has one or more **Sync Devices**; **Sync** propagates changes between them.
- A **Sync Conflict** concerns one **User Account** and one or more competing changes.
- A **Project** contains zero or more **Sections** and **Tasks**; a **Task** may have **Subtasks**.
- A **Task** may have many **Tags**, **Reminders**, and **Focus Sessions**.
- A **Journal Entry** may have many **Tags**, **Journal Attachments**, and
  **Journal Revisions**; a **Weekly Review** may include read-only Budget and
  Gym activity summaries.
- The Budget domain owns **Expenses**, **Expense Categories**, **Monthly Budgets**,
  **Category Budget Limits**, and **Recurring Expenses**; the Gym domain owns
  **Exercise Definitions** and **Gym Workouts**. Neither is a Journal Entry.
- A **Reminder** may produce one **Notification**.
- A recurring **Task** produces zero or more **Task Occurrences**.
- A **Focus Session** may use one **Focus Preset** and one **Focus Policy**, and may contain multiple **Focus Cycles** and **Focus Interruptions**.
- A **Habit** has one **Habit Schedule** and produces zero or more **Habit Occurrences**.
- A **Habit Occurrence** may have one **Habit Check-in**, many **Habit Progress Logs**, and zero or more **Supporting Tasks**.
- A **Commitment Breach** for a **Habit Occurrence** may create one **Commitment Penalty**.
- A **Flashcard Deck** contains one or more **Flashcards**.
- A **Flashcard** has one **Review Schedule** per supported **Review Direction**.
- A **Study Session** contains zero or more **Flashcard Reviews**, each of which produces one **Review Log**.
- A **Study Session** may produce one **Study Feedback** and one **Growth Receipt**.
- An **Earning Rule** can produce multiple **Growth Awards**, which may create **Growth Ledger Entries** and **Inventory Transactions**.
- **Skill XP** can be routed to one or two **Attributes** through an **Attribute Mapping**.
- A **Growth Ledger Entry** can be reversed by at most one **Reversal**.
- A **Shop Item** belongs to zero or one **Item Category** and can have many **Redemptions**.
- A **User** owns one **Inventory**, and an **Inventory Transaction** changes its quantity for one **Shop Item**.
- An **Achievement** is unlocked at most once per **User**.

## Example dialogue

> **Developer:** "Is this `TaskList` a **Project** or just a visual list?"
> **Domain expert:** "It is a **Project** in the product language. The default one is the **Inbox**, where uncategorized **Tasks** arrive."
> **Developer:** "What about a recurring task and a habit?"
> **Domain expert:** "A recurring task creates a **Task Occurrence**. A **Habit** creates a **Habit Occurrence**, which can receive a **Habit Check-in** and optionally generate a **Supporting Task**."
> **Developer:** "And a study ‘session’ is not a **Focus Session**?"
> **Domain expert:** "Correct. A **Study Session** contains **Flashcard Reviews**; a **Focus Session** records focused work."
> **Developer:** "If the study session earns progression, what do we record?"
> **Domain expert:** "The **Growth Receipt** summarizes the **Growth Awards**, while the **Growth Ledger Entries** and **Inventory Transactions** remain the accounting history."

## Flagged ambiguities

- **`TaskList` and `Project` name the same product concept.** Use **Project** in product, domain, API contract, and user-facing language; retain `TaskList` only as an implementation name until the code is migrated.
- **“Deck” and “Card” are the dominant code and UI names, while the product brief says flashcard decks.** Use **Flashcard Deck** and **Flashcard** in domain prose; treat **Deck** and **Card** as implementation or concise UI forms unless the team explicitly chooses the shorter canonical terms.
- **“Session” is overloaded across `FocusSession`, `StudySession`, authentication refresh sessions, and AI feedback.** Always qualify it as **Focus Session**, **Study Session**, **Tutor Conversation**, or **Authentication Session**; avoid “session” alone.
- **“Review” can mean a single card attempt, a study period, or AI feedback.** Use **Flashcard Review**, **Study Session**, and **Study Feedback** respectively.
- **“Check-in” and “progress log” overlap in the habit code.** Use **Habit Check-in** for the user’s primary submission for an occurrence and **Habit Progress Log** for any measured progress, including focus, task, health, or external sources.
- **“Occurrence” is shared by tasks and habits.** Use **Task Occurrence** and **Habit Occurrence**; do not use “occurrence” without its owner.
- **“Reminder” and “Notification” are distinct.** A **Reminder** is scheduled intent; a **Notification** is the delivered message.
- **“Archive” and “Trash” are distinct lifecycle states.** Archive retains an active item outside normal views; **Trash** is recoverable deletion; permanent deletion is a separate operation.
- **“Priority” and “urgency” are not synonyms.** **Priority** is user-selected importance; urgency is time sensitivity used by the **Eisenhower Matrix** and task rules.
- **“XP” is ambiguous between account and skill progression.** Use **Account XP** and **Skill XP**; reserve bare “XP” for contexts where the target is explicit.
- **“Reward,” “award,” “item,” and “redemption” are overloaded in the Growth code.** Use **Growth Award** for activity output, **Shop Item** for a redeemable/held object, **Redemption** for the coin exchange, and **Growth Receipt** for the summary.
- **“Ledger,” “receipt,” and “transaction” describe different records.** A **Growth Ledger Entry** records XP/coin accounting, an **Inventory Transaction** records item quantity, and a **Growth Receipt** summarizes one award event.
- **“Attribute” and “skill” share one persistence model (`GrowthSkill`) but are different domain concepts.** Use **Attribute** and **Skill** according to their progression role, not the storage type.
- **The AI Tutor is not represented by the current implementation.** The code currently provides **Card Suggestions** and **Study Feedback**; define a **Tutor Conversation** model and workflow before treating **AI Tutor** as implemented domain behavior.
- **Achievement is in the product language but has no corresponding Prisma model or API surface in the scanned code.** Keep **Achievement** as an intended concept, but do not claim it is currently implemented.
- **Cross-platform terminology is explicit.** Product documentation names Web,
  macOS, and iOS, and the sync platform enum includes `MACOS`; use **Platform**
  and **Sync Device** consistently rather than inventing a separate native-app
  term.
- **The glossary source of truth is `agent_docs/ubiquitous_language.md`.** Do not create a second root glossary with competing definitions.
