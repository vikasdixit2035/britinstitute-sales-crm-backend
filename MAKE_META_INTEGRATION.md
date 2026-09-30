# Make.com + Meta Lead Ads CRM Integration

This integration creates a closed loop:

1. Meta Lead Ads sends a new lead to Make.
2. Make creates the lead, or records a repeat contact in the **Retargeting** folder and links it to the original CRM lead.
3. When the CRM status changes, the backend sends that stage to a Make custom webhook.
4. Make passes the stage to **Facebook Conversions API for CRM**.

## Backend configuration

Configure these production environment variables and restart the backend:

```env
MAKE_META_LEADS_API_KEY=<long-random-secret>
MAKE_META_FEEDBACK_WEBHOOK_URL=https://hook.eu1.make.com/<feedback-webhook-id>
MAKE_META_FEEDBACK_API_KEY=<optional-make-custom-webhook-api-key>
MAKE_META_LEAD_EVENT_SOURCE=Lead Manager CRM
```

`MAKE_META_LEADS_API_KEY` must never be added to the frontend or committed to Git.

## Scenario 1: Meta lead capture → CRM

Keep the existing **Facebook Lead Ads > New Lead** trigger. Add **HTTP > Make a request** after it:

- Method: `POST`
- URL: `https://api.leads.britinstitute.uk/api/integrations/meta/leads`
- Header: `x-api-key: <same value as MAKE_META_LEADS_API_KEY>`
- Header: `Content-Type: application/json`
- Body type: JSON

Map the Facebook module output into this body:

```json
{
  "metaLeadId": "<Facebook Lead ID>",
  "name": "<Full name>",
  "email": "<Email>",
  "phone": "<Phone number>",
  "campaignName": "<Campaign name>",
  "adsetName": "<Ad set name>",
  "adName": "<Ad name>",
  "formId": "<Form ID>",
  "pageId": "<Page ID>",
  "adId": "<Ad ID>",
  "createdTime": "<Created time>"
  "createdTime": "<Created time>",
  "fieldData": <1. Field data>,
  "mappableFieldData": <1. Mappable field data>
}
```

The API also accepts Make/Meta snake-case names such as `lead_id`, `full_name`, `phone_number`, `campaign_name`, and `created_time`. Only `metaLeadId` is required. Missing, placeholder, or invalid contact values do not reject the lead: the original values and complete incoming payload are retained on the Meta lead, while unique internal fallback values keep the CRM record usable. Repeated delivery of the same Facebook Lead ID is idempotent and returns the existing record instead of creating a duplicate. A new Facebook Lead ID whose normalized email or phone already belongs to a CRM lead creates a separate Retargeting event. The original lead keeps its stage, assignment, notes, and conversation history.
### Passing custom form attributes (e.g. goals, education level, timeline)

Different Meta Lead Ads forms contain different custom questions and choices (such as `what_is_your_primary_goal_for_enrolling_in_this_program?`, `education_level`, `when_are_you_planning_to_start_the_course?`, `what_is_your_current_status?`).

You can pass these into the CRM in any of the following convenient ways:

1. **Recommended (Automated)**: Map `"fieldData": <1. Field data>` or `"mappableFieldData": <1. Mappable field data>` in the JSON body. The CRM will automatically detect all questions and answers, format question labels (e.g. converting `what_is_your_primary_goal_for_enrolling_in_this_program?` to *What is your primary goal for enrolling in this program?*), clean up option values, and display them under **Meta Attribution** in the CRM lead details page.
2. **Direct JSON keys**: Map custom question fields directly as additional properties in the JSON body:
   ```json
   "what_is_your_primary_goal_for_enrolling_in_this_program": "<1. Field data.what_is_your_primary_goal_for_enrolling_in_this_program>",
   "education_level": "<1. Field data.education_level>",
   "when_are_you_planning_to_start_the_course": "<1. Field data.when_are_you_planning_to_start_the_course>"
   ```
3. **Explicit object**: Place them inside `"customFields": { ... }` or `"metaAttributes": [ ... ]`.

The API also accepts Make/Meta snake-case names such as `lead_id`, `full_name`, `phone_number`, `campaign_name`, and `created_time`. Only `metaLeadId` is required. Missing, placeholder, or invalid contact values do not reject the lead: the original values and complete incoming payload are retained on the Meta lead, while unique internal fallback values keep the CRM record usable. Repeated delivery of the same Facebook Lead ID is idempotent and updates/refreshes custom form attributes on the lead instead of creating a duplicate. A new Facebook Lead ID whose normalized email or phone already belongs to a CRM lead creates a separate Retargeting event. The original lead keeps its stage, assignment, notes, and conversation history.

Expected success outcomes are `created`, `retargeting` (a repeat contact linked to the original lead), or `duplicate`.

## Scenario 2: CRM status → Meta feedback

Create a second scenario:

1. Add **Webhooks > Custom webhook** and name it `CRM Meta status feedback`.
2. Optionally configure an API key on the webhook; put the same value in `MAKE_META_FEEDBACK_API_KEY`.
3. Copy its webhook URL into `MAKE_META_FEEDBACK_WEBHOOK_URL` on the backend.
4. Add **Facebook Conversions API for CRM > Create a Lead Event**.
5. Map the webhook fields as follows:

| Facebook Conversions API for CRM field | Webhook field |
| --- | --- |
| Event Name | `eventName` |
| Event Time | `eventTime` |
| Lead ID | `leadId` |
| Email | `email` |
| Phone Number | `phoneNumber` |
| Lead Event Source | `leadEventSource` |
| Pixel ID | Select the CRM pixel/dataset configured in Meta |

The webhook also receives `crmLeadId`, `status`, `previousStatus`, `campaignName`, `adsetName`, and `adName` for logging or filters. Keep Event Name mapped dynamically: the CRM sends every stage, including the initial `New` stage and subsequent statuses such as `Contacted`, `Qualified`, and `Sales Done`.

Turn both scenarios on with **Immediately as data arrives**.

## Verification

1. Click **Run once** on Scenario 1.
2. Submit a test lead with Meta's Lead Ads Testing Tool.
3. Confirm the HTTP module returns `201` with `outcome: created` (or `200` for a duplicate).
4. Open the lead in CRM and verify the **Meta Attribution** card.
5. Change the lead status.
6. Confirm Scenario 2 runs and the CRM card shows the latest feedback status/time.
7. Confirm the event appears in Meta Events Manager for the selected CRM pixel/dataset.

If Scenario 1 gets `401`, the API keys do not match. A `422` means the Meta Lead ID itself was not mapped. Invalid or missing name, email, and phone values are accepted and retained. If the lead is saved but feedback is not sent, check `MAKE_META_FEEDBACK_WEBHOOK_URL`, the optional custom-webhook API key, and the error shown in the Meta Attribution card.
