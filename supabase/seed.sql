-- =============================================================================
-- CSA Digital Hub - demo seed data
--
-- Concept prototype for the CSA Rotterdam IT Committee application. This is not
-- an official CSA product and contains no CSA data.
--
-- EVERY ROW IN THIS FILE IS FICTIONAL. The people, the businesses, the events
-- and the ticket codes were invented for the demo. No real member, no real
-- address, no real payment ever reaches this file.
--
-- Written against docs/architecture.md (frozen Wave 0 contract). Table and
-- column names, the closed enums and the integer-cent money rule all come from
-- there; nothing here invents a column.
--
-- Dates are RELATIVE to the load date (`current_date +/- n`, resolved at the
-- Europe/Amsterdam wall clock and stored as UTC). A demo loaded in six months'
-- time still has upcoming events, a live membership and a plausible history -
-- absolute dates would have quietly rotted into a screen full of past events.
--
-- The file is re-runnable: it truncates what it seeds before inserting.
-- =============================================================================

begin;

set local search_path = public;

truncate table
    analytics_events,
    audit_events,
    scan_attempts,
    payments,
    registrations,
    membership_periods,
    events,
    partners,
    users
cascade;


-- -----------------------------------------------------------------------------
-- 1. Users
--
-- Four demo identities from contract section 7, plus twelve more so the
-- committee dashboard has a real spread to render. Role is permission only:
-- admin@demo.local and staff@demo.local also hold paid memberships, and
-- member@demo.local is a plain `attendee`. Member pricing never comes from role.
-- -----------------------------------------------------------------------------
insert into users (id, email, full_name, role, created_at) values
    ('93c9da93-7ffb-498e-afc1-2798ea05112e', 'member@demo.local', 'Yuxin Zhao', 'attendee',
     (current_date - 665 + time '09:00') at time zone 'Europe/Amsterdam'),  -- Demo identity: active general membership.
    ('b4191885-f836-4ccd-bfc4-e0ccaf88dcae', 'nonmember@demo.local', 'Tom Verhoeven', 'attendee',
     (current_date - 237 + time '10:07') at time zone 'Europe/Amsterdam'),  -- Demo identity: registered, never held a membership.
    ('a941e714-9c9f-41a2-ab22-2a7a6e16ff75', 'admin@demo.local', 'Ruoxi Chen', 'admin',
     (current_date - 265 + time '11:14') at time zone 'Europe/Amsterdam'),  -- Demo identity: IT Committee chair.
    ('c099a3f6-a191-4a70-b588-1b5e6e3ed470', 'staff@demo.local', 'Haoran Wang', 'staff',
     (current_date - 282 + time '12:21') at time zone 'Europe/Amsterdam'),  -- Demo identity: door scanner volunteer.
    ('872c5400-91e5-4822-a31c-8eb7c0fed8d7', 'wenjing.li@demo.local', 'Wenjing Li', 'attendee',
     (current_date - 609 + time '13:28') at time zone 'Europe/Amsterdam'),  -- Membership lapsed four months ago - the expired-member pricing case.
    ('bc3a3324-6a05-4360-9278-f031f956c774', 'jiale.sun@demo.local', 'Jiale Sun', 'attendee',
     (current_date - 254 + time '14:35') at time zone 'Europe/Amsterdam'),
    ('a92afbd8-b796-48af-a79f-692cc97bbc4b', 'priya.raghunathan@demo.local', 'Priya Raghunathan', 'attendee',
     (current_date - 364 + time '15:42') at time zone 'Europe/Amsterdam'),  -- Membership cancelled mid-year, so never gets member pricing.
    ('eda6ce25-63b6-4385-b188-4da4f4ce248a', 'kevin.ng@demo.local', 'Kevin Ng', 'attendee',
     (current_date - 257 + time '16:49') at time zone 'Europe/Amsterdam'),  -- Graduated; holds an alumni membership.
    ('68807d4e-7ac3-4f27-9559-72179474af97', 'minhao.zhou@demo.local', 'Minhao Zhou', 'attendee',
     (current_date - 123 + time '17:56') at time zone 'Europe/Amsterdam'),
    ('11beeb4a-badf-46c7-af82-af74f38463fd', 'anouk.dewit@demo.local', 'Anouk de Wit', 'attendee',
     (current_date - 140 + time '18:03') at time zone 'Europe/Amsterdam'),
    ('5426b249-9549-4c18-840b-3b14990d8afa', 'peiqi.xu@demo.local', 'Peiqi Xu', 'staff',
     (current_date - 281 + time '19:10') at time zone 'Europe/Amsterdam'),  -- Second scanner volunteer; also a paying member.
    ('67571857-8d98-4020-85c1-bb19cb10f101', 'bram.meijer@demo.local', 'Bram Meijer', 'attendee',
     (current_date - 156 + time '09:17') at time zone 'Europe/Amsterdam'),  -- Regular attendee who has never joined - always public price.
    ('0b83fae0-6a0f-44b0-ae7e-be808bad1f35', 'zixuan.huang@demo.local', 'Zixuan Huang', 'attendee',
     (current_date - 160 + time '10:24') at time zone 'Europe/Amsterdam'),
    ('4fb085c3-ecb5-4ea2-9497-7c4d95e4dba6', 'yara.bouzid@demo.local', 'Yara Bouzid', 'attendee',
     (current_date - 188 + time '11:31') at time zone 'Europe/Amsterdam'),
    ('6da4f554-8612-4359-a481-b293af78e1fb', 'chenyu.liu@demo.local', 'Chenyu Liu', 'attendee',
     (current_date - 442 + time '12:38') at time zone 'Europe/Amsterdam'),
    ('ece0958c-0dca-4ecf-897f-b9e64f7c463a', 'grace.lam@demo.local', 'Grace Lam', 'attendee',
     (current_date - 1300 + time '13:45') at time zone 'Europe/Amsterdam');  -- Former board member, honorary membership.

-- -----------------------------------------------------------------------------
-- 2. Membership periods
--
-- A period runs a full membership year from the date it is bought. A user may
-- hold several; at most one is active at a time (contract section 4).
--
--   member@demo.local  - one expired year, a three-month lapse, then the live
--                        renewal that expires seven months from now. That gap is
--                        deliberate: his Dumpling Workshop registration falls
--                        inside it, so he paid the public price for it and the
--                        member price for everything since.
--   wenjing.li         - expired four months ago. Same person, both prices,
--                        depending only on when she registered.
--   priya.raghunathan  - dates still cover today, status is `cancelled`, so she
--                        is not a member. Status and window are both checked.
-- -----------------------------------------------------------------------------
insert into membership_periods (id, user_id, member_number, membership_type, status, starts_at, expires_at, created_at) values
    -- Yuxin Zhao
    ('1ef006a0-a6aa-4932-838c-ce1fedfcea72', '93c9da93-7ffb-498e-afc1-2798ea05112e', 'CSA-004821', 'general', 'expired',
     ((current_date - interval '20 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '8 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '20 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),  -- First year, then a three-month lapse.
    -- Yuxin Zhao
    ('c45b8f85-3631-4a15-b818-6e72183f8089', '93c9da93-7ffb-498e-afc1-2798ea05112e', 'CSA-006190', 'general', 'active',
     ((current_date - interval '5 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '7 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '5 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),  -- Renewed. THE demo membership - active, expires well into the future.
    -- Wenjing Li
    ('7588f3aa-2ca2-4d61-808e-9c699058b9ea', '872c5400-91e5-4822-a31c-8eb7c0fed8d7', 'CSA-004417', 'general', 'expired',
     ((current_date - interval '16 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '4 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '16 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),  -- Expired: pays public price today, paid member price six months ago.
    -- Jiale Sun
    ('55a3b6fa-5383-48b1-a84f-312d03b20a14', 'bc3a3324-6a05-4360-9278-f031f956c774', 'CSA-006204', 'general', 'active',
     ((current_date - interval '4 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '8 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '4 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Priya Raghunathan
    ('4c8bc4ed-5865-4208-afaa-440597f92773', 'a92afbd8-b796-48af-a79f-692cc97bbc4b', 'CSA-005977', 'general', 'cancelled',
     ((current_date - interval '7 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '5 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '7 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),  -- Cancelled after a semester abroad - dates still cover today, status does not.
    -- Kevin Ng
    ('2bc210ed-185b-4a55-b003-e3b7eaec583b', 'eda6ce25-63b6-4385-b188-4da4f4ce248a', 'CSA-003158', 'alumni', 'active',
     ((current_date - interval '3 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '9 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '3 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Minhao Zhou
    ('b618fe17-7fda-4252-85e7-7e4236087cb7', '68807d4e-7ac3-4f27-9559-72179474af97', 'CSA-006233', 'general', 'active',
     ((current_date - interval '2 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '10 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '2 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Anouk de Wit
    ('6befe2b0-931e-4a6e-9d03-d4ee50dc1b84', '11beeb4a-badf-46c7-af82-af74f38463fd', 'CSA-006241', 'general', 'active',
     ((current_date - interval '2 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '10 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '2 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Peiqi Xu
    ('8954e1a3-4bd8-4e7d-a59b-4c5fcaf1f3a5', '5426b249-9549-4c18-840b-3b14990d8afa', 'CSA-006112', 'general', 'active',
     ((current_date - interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Zixuan Huang
    ('5480bb6c-9dc7-41cf-af1c-f5ddaecdcbe7', '0b83fae0-6a0f-44b0-ae7e-be808bad1f35', 'CSA-006255', 'general', 'active',
     ((current_date - interval '1 month')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '11 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '1 month')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Chenyu Liu
    ('d2cf58bf-4621-4bc5-99d8-0318ee71e126', '6da4f554-8612-4359-a481-b293af78e1fb', 'CSA-005863', 'general', 'active',
     ((current_date - interval '9 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '3 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '9 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),
    -- Grace Lam
    ('d6d3402d-a5a4-4399-b339-8bba540f2668', 'ece0958c-0dca-4ecf-897f-b9e64f7c463a', 'CSA-000042', 'honorary', 'active',
     ((current_date - interval '40 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '80 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '40 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),  -- Honorary membership does not lapse with the academic year.
    -- Ruoxi Chen
    ('238c2ec6-ddca-496f-a66f-d63860d23be3', 'a941e714-9c9f-41a2-ab22-2a7a6e16ff75', 'CSA-006108', 'general', 'active',
     ((current_date - interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam'),  -- Committee members pay for membership like everyone else - role is not membership.
    -- Haoran Wang
    ('bd06953e-1222-4370-8174-964dc1437ec7', 'c099a3f6-a191-4a70-b588-1b5e6e3ed470', 'CSA-006121', 'general', 'active',
     ((current_date - interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date + interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam',
     ((current_date - interval '6 months')::date + time '00:00') at time zone 'Europe/Amsterdam');

-- -----------------------------------------------------------------------------
-- 3. Events
--
-- All five categories, all four statuses, and the awkward cases the demo needs:
--
--   sold out          - Dim Sum Brunch, capacity 12 with exactly 12 registrations
--   deadline passed   - Career Trek, starts in four days, closed two days ago
--   draft             - Winter Ski Weekend, never visible to members
--   cancelled         - Spring Boat Cruise, its three registrations refunded
--   free              - Mandarin Conversation Cafe and the Consulting Career
--                       Night, both prices 0, so register_for_event marks the
--                       registration `paid` on the spot
--   member-only free  - Harbour Photo Walk, 0 for members and 500 for everyone
--                       else, which exercises both branches of one event
--   capacity 1        - the [DEMO ONLY] fixture at the bottom. Named loudly, and
--                       it has no registrations. Leave it that way.
--
-- Deadlines always precede start times. Prices are integer cents, EUR.
-- -----------------------------------------------------------------------------
insert into events (id, title, description, category, location, starts_at, registration_deadline_at,
                    capacity, price_member_cents, price_public_cents, status, image_url, created_at) values
    -- Hotpot Night: Sichuan Edition (social, published, already happened)
    ('4b0f665b-ca9d-4964-9bf6-7e7d128e3730', 'Hotpot Night: Sichuan Edition',
     'Twelve tables, unlimited broth refills and a mala level for every tolerance. Bring your own drinks; the association covers the ingredients.',
     'social', 'Delfshaven Kitchen Loft',
     (current_date - 38 + time '18:30') at time zone 'Europe/Amsterdam',
     (current_date - 41 + time '23:59') at time zone 'Europe/Amsterdam',
     60, 750, 1400, 'published', '/images/events/hotpot-sichuan.jpg',
     (current_date - 61 + time '09:00') at time zone 'Europe/Amsterdam'),
    -- Mandarin Conversation Cafe #12 (educational, published, already happened)
    ('f6e4c333-afba-455d-be45-0ac69c73fa6b', 'Mandarin Conversation Cafe #12',
     'Weekly drop-in practice hour. Tables are split by level, from absolute beginner to near-native, and each one has a native-speaker host.',
     'educational', 'Kralingen Study Hub, room 2.14',
     (current_date - 17 + time '17:00') at time zone 'Europe/Amsterdam',
     (current_date - 19 + time '23:59') at time zone 'Europe/Amsterdam',
     30, 0, 0, 'published', '/images/events/mandarin-cafe-12.jpg',
     (current_date - 39 + time '10:13') at time zone 'Europe/Amsterdam'),
    -- CV and Cover Letter Clinic (career, published, already happened)
    ('456ce091-50a3-42c9-8c4a-9a23d6ec0366', 'CV and Cover Letter Clinic',
     'Bring a printed CV and leave with it marked up. Alumni working in consulting, logistics and tech review in twenty-minute slots. Free for members.',
     'career', 'Blaakhaven Career Lounge',
     (current_date - 24 + time '16:00') at time zone 'Europe/Amsterdam',
     (current_date - 26 + time '23:59') at time zone 'Europe/Amsterdam',
     40, 0, 500, 'published', '/images/events/cv-clinic.jpg',
     (current_date - 46 + time '11:26') at time zone 'Europe/Amsterdam'),
    -- Badminton Ladder - Round 3 (sports, published, already happened)
    ('2f8e4f30-35d8-49b1-af86-9be96fd5c517', 'Badminton Ladder - Round 3',
     'Third round of the autumn ladder. Rackets available to borrow, shuttles provided, results count towards the season table.',
     'sports', 'Coolhaven Sports Hall, court 3',
     (current_date - 11 + time '20:00') at time zone 'Europe/Amsterdam',
     (current_date - 13 + time '23:59') at time zone 'Europe/Amsterdam',
     24, 300, 600, 'published', '/images/events/badminton-ladder-3.jpg',
     (current_date - 33 + time '12:39') at time zone 'Europe/Amsterdam'),
    -- Dumpling Making Workshop (cultural, published, already happened)
    ('06e9b3d7-ea53-4747-a6fd-d1684acd870a', 'Dumpling Making Workshop',
     'Folding, pleating and pan-frying from scratch, taught by two board members. Everything you make, you eat.',
     'cultural', 'Katendrecht Kitchen Studio',
     (current_date - 168 + time '15:00') at time zone 'Europe/Amsterdam',
     (current_date - 172 + time '23:59') at time zone 'Europe/Amsterdam',
     36, 600, 1100, 'published', '/images/events/dumpling-workshop.jpg',
     (current_date - 192 + time '13:52') at time zone 'Europe/Amsterdam'),
    -- Dim Sum Brunch at Katendrecht (social, sold_out, upcoming)
    ('97e5d585-4b19-4a20-8654-c06e4a45f73f', 'Dim Sum Brunch at Katendrecht',
     'One long table, a rolling cart and far too many baskets. Twelve seats only, which is why this one is already closed.',
     'social', 'Pearl Garden Teahouse, Katendrecht',
     (current_date + 6 + time '11:30') at time zone 'Europe/Amsterdam',
     (current_date + 3 + time '23:59') at time zone 'Europe/Amsterdam',
     12, 900, 1600, 'sold_out', '/images/events/dim-sum-brunch.jpg',
     (current_date - 25 + time '14:05') at time zone 'Europe/Amsterdam'),
    -- Badminton Social - Coolhaven Courts (sports, published, upcoming)
    ('1e143db5-68a8-4244-95a3-6d743754f5f7', 'Badminton Social - Coolhaven Courts',
     'Casual doubles, no ladder points, all levels welcome. Courts are booked for three hours; drop in whenever.',
     'sports', 'Coolhaven Sports Hall, courts 1-4',
     (current_date + 8 + time '20:00') at time zone 'Europe/Amsterdam',
     (current_date + 7 + time '18:00') at time zone 'Europe/Amsterdam',
     32, 300, 600, 'published', '/images/events/badminton-social.jpg',
     (current_date - 16 + time '15:18') at time zone 'Europe/Amsterdam'),
    -- Hotpot and Mahjong Night (social, published, upcoming)
    ('15403cb1-02f5-4587-91f6-5dc263b33903', 'Hotpot and Mahjong Night',
     'Two rooms: one for the pot, one for the tiles. Beginners are taught the Cantonese rules at the start of the evening.',
     'social', 'Delfshaven Kitchen Loft',
     (current_date + 12 + time '18:30') at time zone 'Europe/Amsterdam',
     (current_date + 10 + time '23:59') at time zone 'Europe/Amsterdam',
     60, 750, 1400, 'published', '/images/events/hotpot-mahjong.jpg',
     (current_date - 20 + time '16:31') at time zone 'Europe/Amsterdam'),
    -- Rotterdam Harbour Photo Walk (social, published, upcoming)
    ('0c013ee6-c994-4802-8819-f1f4b35ec415', 'Rotterdam Harbour Photo Walk',
     'Three hours along the water with two photographers from the committee. Free for members, five euro for everyone else. Phone cameras are fine.',
     'social', 'Wilhelminapier, meeting point at the ferry steps',
     (current_date + 19 + time '14:00') at time zone 'Europe/Amsterdam',
     (current_date + 17 + time '23:59') at time zone 'Europe/Amsterdam',
     25, 0, 500, 'published', '/images/events/harbour-photo-walk.jpg',
     (current_date - 17 + time '17:44') at time zone 'Europe/Amsterdam'),
    -- Consulting Career Night: Alumni Panel (career, published, upcoming)
    ('c02ab5e6-acd0-4b60-a75f-56bcc8648316', 'Consulting Career Night: Alumni Panel',
     'Four alumni from consulting, banking and logistics on how they went from a Rotterdam student room to a first contract. Free, and open to non-members.',
     'career', 'Blaakhaven Career Lounge',
     (current_date + 26 + time '18:00') at time zone 'Europe/Amsterdam',
     (current_date + 23 + time '23:59') at time zone 'Europe/Amsterdam',
     90, 0, 0, 'published', '/images/events/consulting-career-night.jpg',
     (current_date - 19 + time '09:57') at time zone 'Europe/Amsterdam'),
    -- Chinese Calligraphy Workshop (educational, published, upcoming)
    ('022299e2-b8b5-4e80-be8f-811c0b56be23', 'Chinese Calligraphy Workshop',
     'Brush, ink and rice paper provided. We start with the eight basic strokes and finish with a character you can take home.',
     'educational', 'Kralingen Study Hub, room 1.06',
     (current_date + 33 + time '15:00') at time zone 'Europe/Amsterdam',
     (current_date + 30 + time '23:59') at time zone 'Europe/Amsterdam',
     24, 500, 900, 'published', '/images/events/calligraphy-workshop.jpg',
     (current_date - 13 + time '10:10') at time zone 'Europe/Amsterdam'),
    -- Thesis Writing Bootcamp (educational, published, upcoming)
    ('993956c1-97fb-45d2-81ba-e1fde01d18a6', 'Thesis Writing Bootcamp',
     'A full morning of structured writing sprints with a librarian on hand for sourcing and referencing questions.',
     'educational', 'Kralingen Study Hub, silent floor',
     (current_date + 40 + time '10:00') at time zone 'Europe/Amsterdam',
     (current_date + 37 + time '23:59') at time zone 'Europe/Amsterdam',
     40, 400, 800, 'published', '/images/events/thesis-bootcamp.jpg',
     (current_date - 12 + time '11:23') at time zone 'Europe/Amsterdam'),
    -- Mid-Autumn Festival Gala (cultural, published, upcoming)
    ('c96232df-058c-4eed-a361-401ec0280cd8', 'Mid-Autumn Festival Gala',
     'The biggest cultural night of the autumn: mooncakes, a lantern riddle round, a student band and a lion dance to close.',
     'cultural', 'Maasboulevard Event Hall',
     (current_date + 45 + time '19:00') at time zone 'Europe/Amsterdam',
     (current_date + 40 + time '23:59') at time zone 'Europe/Amsterdam',
     180, 1200, 2200, 'published', '/images/events/mid-autumn-gala.jpg',
     (current_date - 28 + time '12:36') at time zone 'Europe/Amsterdam'),
    -- Lunar New Year Gala 2027 (cultural, published, upcoming)
    ('ecf69fda-b950-4758-bcf9-5c7f7149beba', 'Lunar New Year Gala 2027',
     'The association''s flagship evening: a three-course banquet, a full performance programme and an after-party until late. Early-bird registration is open.',
     'cultural', 'Rijnhaven Grand Hall',
     (current_date + 170 + time '18:00') at time zone 'Europe/Amsterdam',
     (current_date + 160 + time '23:59') at time zone 'Europe/Amsterdam',
     300, 1500, 2750, 'published', '/images/events/lunar-new-year-gala.jpg',
     (current_date - 11 + time '13:49') at time zone 'Europe/Amsterdam'),
    -- Career Trek: Port and Logistics Day (career, published, upcoming)
    ('32b49941-d814-4506-8d33-f69f8cfa739a', 'Career Trek: Port and Logistics Day',
     'A guided morning at a container terminal and an afternoon with three logistics recruiters. Registration has closed: the group list is final and the site needs it in advance.',
     'career', 'Waalhaven container terminal, gate 4',
     (current_date + 4 + time '09:30') at time zone 'Europe/Amsterdam',
     (current_date - 2 + time '23:59') at time zone 'Europe/Amsterdam',
     30, 500, 1000, 'published', '/images/events/career-trek-port.jpg',
     (current_date - 23 + time '14:02') at time zone 'Europe/Amsterdam'),
    -- Winter Ski Weekend (Sauerland) (sports, draft, upcoming)
    ('c803f235-da43-427f-9f8d-246ce3dd126c', 'Winter Ski Weekend (Sauerland)',
     'Four days, coach travel, half board and a two-day lift pass. Still a draft: the coach quote and the final member price are not confirmed.',
     'sports', 'Sauerland, Germany - coach departs from the central station',
     (current_date + 120 + time '07:00') at time zone 'Europe/Amsterdam',
     (current_date + 90 + time '23:59') at time zone 'Europe/Amsterdam',
     45, 18500, 22500, 'draft', '/images/events/ski-weekend.jpg',
     (current_date - 10 + time '15:15') at time zone 'Europe/Amsterdam'),
    -- Spring Boat Cruise on the Maas (social, cancelled, upcoming)
    ('f4a1fe16-fc71-4516-9b40-4afa8a32ac11', 'Spring Boat Cruise on the Maas',
     'Cancelled. The charter operator withdrew the boat and no replacement was available for the date. Everyone who had registered has been refunded in full.',
     'social', 'Boarding at the Veerhaven jetty',
     (current_date + 30 + time '19:00') at time zone 'Europe/Amsterdam',
     (current_date + 24 + time '23:59') at time zone 'Europe/Amsterdam',
     80, 1750, 2500, 'cancelled', '/images/events/boat-cruise.jpg',
     (current_date - 31 + time '16:28') at time zone 'Europe/Amsterdam'),
    -- [DEMO ONLY] Concurrency Test - Single Seat (educational, published, upcoming)
    ('084cb5e2-dd44-42ff-bcd7-144a85b8283d', '[DEMO ONLY] Concurrency Test - Single Seat',
     'Internal demo fixture, not a real event. Capacity is deliberately 1 so two simultaneous register_for_event calls can be fired at it to show that exactly one wins and the other raises event_full. Leave the seat free.',
     'educational', 'No physical venue - internal fixture',
     (current_date + 90 + time '12:00') at time zone 'Europe/Amsterdam',
     (current_date + 88 + time '23:59') at time zone 'Europe/Amsterdam',
     1, 0, 0, 'published', '/images/events/concurrency-fixture.jpg',
     (current_date - 10 + time '17:41') at time zone 'Europe/Amsterdam');

-- -----------------------------------------------------------------------------
-- 4. Registrations
--
-- Joined to users and events by their natural keys so each row reads as a
-- sentence rather than as four uuids. `price_paid_cents` and `is_member_price`
-- are what `register_for_event` would have written at `created_at`: every
-- is_member_price = true below belongs to a user whose membership period was
-- genuinely active on that date, which is why Yuxin Zhao's Dumpling Workshop row
-- says false.
--
-- Payment status is mixed on purpose - paid, pending, one failed card, three
-- refunds from the cancelled cruise - and past events carry a realistic
-- no-show rate rather than a clean 100% check-in.
--
-- Ticket codes are 10 characters of Crockford base32, non-sequential, unrelated
-- to any id (contract section 6).
-- -----------------------------------------------------------------------------
insert into registrations (id, event_id, user_id, ticket_code, price_paid_cents,
                           is_member_price, payment_status, checked_in_at, created_at)
select v.id::uuid,
       e.id,
       u.id,
       v.ticket_code,
       v.price_paid_cents,
       v.is_member_price,
       v.payment_status::payment_status,
       v.checked_in_at,
       v.created_at
from (values
    -- Hotpot Night: Sichuan Edition - 750 member / 1400 public cents
    ('b25c7830-8c61-4c18-a2e9-be275ffe3d80', 'Hotpot Night: Sichuan Edition',
     'member@demo.local', '9TYGVW20GN', 750, true, 'paid',
     (current_date - 38 + time '18:34') at time zone 'Europe/Amsterdam',
     (current_date - 52 + time '21:07') at time zone 'Europe/Amsterdam'),
    ('beb244f5-e4b8-40cc-8762-2440d13cec72', 'Hotpot Night: Sichuan Edition',
     'jiale.sun@demo.local', 'TZGBWDASB4', 750, true, 'paid',
     (current_date - 38 + time '18:41') at time zone 'Europe/Amsterdam',
     (current_date - 50 + time '13:22') at time zone 'Europe/Amsterdam'),
    ('d8b19b03-a62b-4468-a865-f127bdd51899', 'Hotpot Night: Sichuan Edition',
     'nonmember@demo.local', 'V28BJ4HN4W', 1400, false, 'paid',
     (current_date - 38 + time '18:52') at time zone 'Europe/Amsterdam',
     (current_date - 47 + time '09:48') at time zone 'Europe/Amsterdam'),
    ('ee910ccd-718a-4f39-a2f6-4c2f0cc82765', 'Hotpot Night: Sichuan Edition',
     'wenjing.li@demo.local', 'V8B2VCRRPE', 1400, false, 'paid',
     (current_date - 38 + time '19:05') at time zone 'Europe/Amsterdam',
     (current_date - 45 + time '20:31') at time zone 'Europe/Amsterdam'),  -- public price: same person, membership since expired
    ('864ea9ed-8c8b-4fbd-86cc-cd00e00daadf', 'Hotpot Night: Sichuan Edition',
     'bram.meijer@demo.local', 'DNYFVMX7Q2', 1400, false, 'paid',
     null::timestamptz,
     (current_date - 44 + time '11:15') at time zone 'Europe/Amsterdam'),  -- paid, no-show
    ('f4787508-d53e-406e-94ee-dc9b36501d19', 'Hotpot Night: Sichuan Edition',
     'minhao.zhou@demo.local', '6K5PQJ3J5C', 750, true, 'paid',
     (current_date - 38 + time '18:36') at time zone 'Europe/Amsterdam',
     (current_date - 43 + time '16:02') at time zone 'Europe/Amsterdam'),
    ('157b15f4-df7c-4fb5-bb0f-935faf2bd6e3', 'Hotpot Night: Sichuan Edition',
     'yara.bouzid@demo.local', '1Z8KPEDKQZ', 1400, false, 'failed',
     null::timestamptz,
     (current_date - 42 + time '22:47') at time zone 'Europe/Amsterdam'),  -- card declined - the registration exists, the money never arrived

    -- Mandarin Conversation Cafe #12 - 0 member / 0 public cents
    ('3863dd28-61ce-472f-8b66-a862afe79e92', 'Mandarin Conversation Cafe #12',
     'anouk.dewit@demo.local', 'BB8YG815CD', 0, true, 'paid',
     (current_date - 17 + time '17:03') at time zone 'Europe/Amsterdam',
     (current_date - 26 + time '10:12') at time zone 'Europe/Amsterdam'),
    ('1807b043-2c1d-4b7c-b4cb-bb26fc71fc91', 'Mandarin Conversation Cafe #12',
     'zixuan.huang@demo.local', 'PAXVT7E56G', 0, true, 'paid',
     (current_date - 17 + time '17:01') at time zone 'Europe/Amsterdam',
     (current_date - 24 + time '19:38') at time zone 'Europe/Amsterdam'),
    ('269e8a48-568a-4d0a-966d-344b85d8a69a', 'Mandarin Conversation Cafe #12',
     'nonmember@demo.local', 'AEW3QZ0SEF', 0, false, 'paid',
     (current_date - 17 + time '17:11') at time zone 'Europe/Amsterdam',
     (current_date - 23 + time '08:55') at time zone 'Europe/Amsterdam'),
    ('b0e3f12d-54a6-4713-b3a5-2cadd68af047', 'Mandarin Conversation Cafe #12',
     'chenyu.liu@demo.local', 'CVTRWJSJPW', 0, true, 'paid',
     null::timestamptz,
     (current_date - 21 + time '15:44') at time zone 'Europe/Amsterdam'),
    ('e3ec5866-f9a4-4d33-b1fc-2d363b1d3124', 'Mandarin Conversation Cafe #12',
     'priya.raghunathan@demo.local', 'TTXATB75TY', 0, false, 'paid',
     (current_date - 17 + time '17:06') at time zone 'Europe/Amsterdam',
     (current_date - 20 + time '12:30') at time zone 'Europe/Amsterdam'),  -- cancelled membership: public price, which on a free event is also 0

    -- CV and Cover Letter Clinic - 0 member / 500 public cents
    ('19529dd3-cccb-4d1d-9a1b-a1cbb2d55ffd', 'CV and Cover Letter Clinic',
     'kevin.ng@demo.local', 'DWBFK4S3PC', 0, true, 'paid',
     (current_date - 24 + time '16:02') at time zone 'Europe/Amsterdam',
     (current_date - 33 + time '14:20') at time zone 'Europe/Amsterdam'),
    ('1eb3f7a6-1f31-48fb-9a22-541e96db21f5', 'CV and Cover Letter Clinic',
     'nonmember@demo.local', 'P03AKR1WAG', 500, false, 'paid',
     (current_date - 24 + time '16:09') at time zone 'Europe/Amsterdam',
     (current_date - 31 + time '17:41') at time zone 'Europe/Amsterdam'),
    ('0636aba6-e830-40d4-8d06-67f7f34664be', 'CV and Cover Letter Clinic',
     'yara.bouzid@demo.local', 'NHNM8NRJYX', 500, false, 'pending',
     null::timestamptz,
     (current_date - 29 + time '23:12') at time zone 'Europe/Amsterdam'),
    ('0b443064-f7c2-4e7e-8d53-d88f33f3ebb9', 'CV and Cover Letter Clinic',
     'peiqi.xu@demo.local', '33SDG85189', 0, true, 'paid',
     (current_date - 24 + time '15:58') at time zone 'Europe/Amsterdam',
     (current_date - 28 + time '09:05') at time zone 'Europe/Amsterdam'),

    -- Badminton Ladder - Round 3 - 300 member / 600 public cents
    ('9d55f239-c143-421d-a571-197634eaae87', 'Badminton Ladder - Round 3',
     'member@demo.local', 'V63V3SP69H', 300, true, 'paid',
     (current_date - 11 + time '19:58') at time zone 'Europe/Amsterdam',
     (current_date - 20 + time '18:44') at time zone 'Europe/Amsterdam'),
    ('c49d8b53-d242-4369-96f3-724c3fceaf3c', 'Badminton Ladder - Round 3',
     'minhao.zhou@demo.local', 'Y1YJS987YR', 300, true, 'paid',
     (current_date - 11 + time '20:03') at time zone 'Europe/Amsterdam',
     (current_date - 18 + time '12:19') at time zone 'Europe/Amsterdam'),
    ('412916d9-7f69-4bad-ae61-abe31cb75662', 'Badminton Ladder - Round 3',
     'bram.meijer@demo.local', '76JZ383BS9', 600, false, 'paid',
     (current_date - 11 + time '20:07') at time zone 'Europe/Amsterdam',
     (current_date - 16 + time '21:33') at time zone 'Europe/Amsterdam'),
    ('493bdc68-fc7e-42a8-98e6-ba37632bf3ae', 'Badminton Ladder - Round 3',
     'grace.lam@demo.local', 'K06CH33EK4', 300, true, 'paid',
     null::timestamptz,
     (current_date - 14 + time '10:47') at time zone 'Europe/Amsterdam'),  -- paid, no-show

    -- Dumpling Making Workshop - 600 member / 1100 public cents
    ('dc189719-9342-4a56-b493-dd0fbc7dbb9b', 'Dumpling Making Workshop',
     'wenjing.li@demo.local', 'TAC62H180F', 600, true, 'paid',
     (current_date - 168 + time '15:04') at time zone 'Europe/Amsterdam',
     (current_date - 181 + time '19:26') at time zone 'Europe/Amsterdam'),  -- member price: her membership was still live six months ago
    ('7c872d95-4122-4dad-826e-7f358499209e', 'Dumpling Making Workshop',
     'member@demo.local', 'QMR3AEXVNG', 1100, false, 'paid',
     (current_date - 168 + time '15:02') at time zone 'Europe/Amsterdam',
     (current_date - 179 + time '08:33') at time zone 'Europe/Amsterdam'),  -- public price: this date falls inside his three-month lapse
    ('efddd9ed-56b9-4a4b-8447-e2aeae6ba5a4', 'Dumpling Making Workshop',
     'chenyu.liu@demo.local', 'XTXC0J6ZB1', 600, true, 'paid',
     (current_date - 168 + time '15:09') at time zone 'Europe/Amsterdam',
     (current_date - 177 + time '13:58') at time zone 'Europe/Amsterdam'),
    ('77a98362-6506-44ec-af78-d42f4c980058', 'Dumpling Making Workshop',
     'nonmember@demo.local', 'XB30BTCJ23', 1100, false, 'refunded',
     null::timestamptz,
     (current_date - 175 + time '20:11') at time zone 'Europe/Amsterdam'),  -- cancelled and refunded, so never checked in

    -- Dim Sum Brunch at Katendrecht - 900 member / 1600 public cents
    --   capacity 12, and exactly 12 rows follow - that is why it is sold_out
    ('ff8431c9-5c1a-4137-a9ff-ad5ff28a5c4d', 'Dim Sum Brunch at Katendrecht',
     'member@demo.local', '0F5YRFE3HH', 900, true, 'paid',
     null::timestamptz,
     (current_date - 18 + time '09:12') at time zone 'Europe/Amsterdam'),
    ('c170e24c-f291-4a27-9df7-90bd261b93d9', 'Dim Sum Brunch at Katendrecht',
     'nonmember@demo.local', '1BK4EFM0MY', 1600, false, 'paid',
     null::timestamptz,
     (current_date - 17 + time '14:38') at time zone 'Europe/Amsterdam'),
    ('20e29786-d540-4479-b597-14f21d7df56c', 'Dim Sum Brunch at Katendrecht',
     'wenjing.li@demo.local', 'F06E2WJHYA', 1600, false, 'pending',
     null::timestamptz,
     (current_date - 16 + time '20:04') at time zone 'Europe/Amsterdam'),
    ('b13cc98b-e55a-4d65-a8b3-407a23f1b24e', 'Dim Sum Brunch at Katendrecht',
     'jiale.sun@demo.local', 'QQ9YZZWGYH', 900, true, 'paid',
     null::timestamptz,
     (current_date - 15 + time '11:27') at time zone 'Europe/Amsterdam'),
    ('34984305-e457-4306-9dde-5b6c8a9f5235', 'Dim Sum Brunch at Katendrecht',
     'priya.raghunathan@demo.local', 'PANSYD404N', 1600, false, 'paid',
     null::timestamptz,
     (current_date - 14 + time '18:53') at time zone 'Europe/Amsterdam'),
    ('214debc0-56c7-48b1-b0df-9a95a4dc5795', 'Dim Sum Brunch at Katendrecht',
     'kevin.ng@demo.local', 'KMHGX5RDWQ', 900, true, 'paid',
     null::timestamptz,
     (current_date - 12 + time '10:41') at time zone 'Europe/Amsterdam'),
    ('aa167626-def5-4e9e-ab6b-3d2e6a686abf', 'Dim Sum Brunch at Katendrecht',
     'minhao.zhou@demo.local', '60A402482Y', 900, true, 'pending',
     null::timestamptz,
     (current_date - 11 + time '22:16') at time zone 'Europe/Amsterdam'),
    ('702e7e62-7763-431a-9fb4-ec9ec7f0c450', 'Dim Sum Brunch at Katendrecht',
     'anouk.dewit@demo.local', 'WCDHJGY4YE', 900, true, 'paid',
     null::timestamptz,
     (current_date - 9 + time '13:05') at time zone 'Europe/Amsterdam'),
    ('08e16b61-fb6f-498f-9fbf-9dc27903483e', 'Dim Sum Brunch at Katendrecht',
     'peiqi.xu@demo.local', '47BSQJ62HW', 900, true, 'paid',
     null::timestamptz,
     (current_date - 8 + time '16:49') at time zone 'Europe/Amsterdam'),
    ('aaea5bc2-8030-4966-88f8-d816753f4f82', 'Dim Sum Brunch at Katendrecht',
     'bram.meijer@demo.local', '1M8WTPMD5D', 1600, false, 'pending',
     null::timestamptz,
     (current_date - 6 + time '19:22') at time zone 'Europe/Amsterdam'),
    ('024dbbfe-50df-4ae8-8b98-6c89501df217', 'Dim Sum Brunch at Katendrecht',
     'zixuan.huang@demo.local', 'WQHQJ19C7R', 900, true, 'paid',
     null::timestamptz,
     (current_date - 4 + time '12:07') at time zone 'Europe/Amsterdam'),
    ('1b4caa66-af58-4feb-b81e-54735499c0f9', 'Dim Sum Brunch at Katendrecht',
     'chenyu.liu@demo.local', 'FET7FSVXTW', 900, true, 'paid',
     null::timestamptz,
     (current_date - 2 + time '08:31') at time zone 'Europe/Amsterdam'),

    -- Badminton Social - Coolhaven Courts - 300 member / 600 public cents
    ('98fac7a3-3222-4273-80a1-d2f60f05f4fe', 'Badminton Social - Coolhaven Courts',
     'minhao.zhou@demo.local', '6C73KXQ9TZ', 300, true, 'paid',
     null::timestamptz,
     (current_date - 9 + time '17:44') at time zone 'Europe/Amsterdam'),
    ('bc8bf52e-c1b9-4285-bdf2-18c2ad7def52', 'Badminton Social - Coolhaven Courts',
     'bram.meijer@demo.local', 'HNV8QEGERG', 600, false, 'pending',
     null::timestamptz,
     (current_date - 7 + time '21:02') at time zone 'Europe/Amsterdam'),
    ('dfb31b12-57f7-4421-87c0-597093cb387e', 'Badminton Social - Coolhaven Courts',
     'grace.lam@demo.local', '0Q5X0YYSXA', 300, true, 'paid',
     null::timestamptz,
     (current_date - 6 + time '10:18') at time zone 'Europe/Amsterdam'),
    ('783a745c-f81f-4ab1-91eb-9e5a4fb067aa', 'Badminton Social - Coolhaven Courts',
     'staff@demo.local', '66K40H1TMZ', 300, true, 'paid',
     null::timestamptz,
     (current_date - 4 + time '15:36') at time zone 'Europe/Amsterdam'),
    ('ddfb8609-093e-4aa3-a463-cc557532939b', 'Badminton Social - Coolhaven Courts',
     'yara.bouzid@demo.local', '5QKH9GDAF7', 600, false, 'paid',
     null::timestamptz,
     (current_date - 3 + time '19:47') at time zone 'Europe/Amsterdam'),

    -- Hotpot and Mahjong Night - 750 member / 1400 public cents
    ('74baeb59-780f-4978-8469-82a319228e17', 'Hotpot and Mahjong Night',
     'member@demo.local', 'QGWEXA4NNC', 750, true, 'paid',
     null::timestamptz,
     (current_date - 13 + time '20:15') at time zone 'Europe/Amsterdam'),
    ('6779887e-b934-4860-ae1b-fe3561d19b66', 'Hotpot and Mahjong Night',
     'nonmember@demo.local', 'DJZ46YQ2E0', 1400, false, 'pending',
     null::timestamptz,
     (current_date - 11 + time '12:44') at time zone 'Europe/Amsterdam'),
    ('978be4e0-ecee-4229-b1a9-f439157a8801', 'Hotpot and Mahjong Night',
     'jiale.sun@demo.local', 'WD4XXE49VM', 750, true, 'paid',
     null::timestamptz,
     (current_date - 10 + time '09:29') at time zone 'Europe/Amsterdam'),
    ('6eb0b874-c5fb-46cf-a504-af10dcac5a94', 'Hotpot and Mahjong Night',
     'zixuan.huang@demo.local', 'VSNVB88KX8', 750, true, 'paid',
     null::timestamptz,
     (current_date - 8 + time '18:07') at time zone 'Europe/Amsterdam'),
    ('cb1a6891-a4b1-4794-beb7-556460f71d0e', 'Hotpot and Mahjong Night',
     'yara.bouzid@demo.local', 'B7G3YVW1TE', 1400, false, 'paid',
     null::timestamptz,
     (current_date - 5 + time '14:52') at time zone 'Europe/Amsterdam'),
    ('b6bd71ea-fcad-4fc1-90d0-e704839a952a', 'Hotpot and Mahjong Night',
     'wenjing.li@demo.local', 'K0RJ3EYQR4', 1400, false, 'pending',
     null::timestamptz,
     (current_date - 3 + time '22:38') at time zone 'Europe/Amsterdam'),

    -- Rotterdam Harbour Photo Walk - 0 member / 500 public cents
    ('9ef027e2-96fc-4685-8b22-40f38dd69ec5', 'Rotterdam Harbour Photo Walk',
     'member@demo.local', '9017C7X0SQ', 0, true, 'paid',
     null::timestamptz,
     (current_date - 10 + time '11:03') at time zone 'Europe/Amsterdam'),  -- free for members, so register_for_event marks it paid immediately
    ('0b47c785-230c-4fc2-be1b-132f3a2736dc', 'Rotterdam Harbour Photo Walk',
     'anouk.dewit@demo.local', 'W7H7S8208G', 0, true, 'paid',
     null::timestamptz,
     (current_date - 8 + time '16:21') at time zone 'Europe/Amsterdam'),
    ('78389e21-5865-4ed6-9fb9-8d8020adb2fd', 'Rotterdam Harbour Photo Walk',
     'nonmember@demo.local', '52WZWP86TV', 500, false, 'pending',
     null::timestamptz,
     (current_date - 6 + time '20:55') at time zone 'Europe/Amsterdam'),  -- same event, no membership: 500 cents and a pending payment
    ('46eb6aa2-98c6-48ae-9bdd-455856e871cf', 'Rotterdam Harbour Photo Walk',
     'bram.meijer@demo.local', 'C5JKESB1Z0', 500, false, 'paid',
     null::timestamptz,
     (current_date - 2 + time '13:14') at time zone 'Europe/Amsterdam'),

    -- Consulting Career Night: Alumni Panel - 0 member / 0 public cents
    ('9f6f5fb7-a0d6-4f63-b9fd-39dfb116eca5', 'Consulting Career Night: Alumni Panel',
     'member@demo.local', '9G05PHAD4N', 0, true, 'paid',
     null::timestamptz,
     (current_date - 12 + time '10:33') at time zone 'Europe/Amsterdam'),
    ('198b83ff-0f7a-48a9-9eeb-1e944c31d3bc', 'Consulting Career Night: Alumni Panel',
     'nonmember@demo.local', 'GFM8RH2Z2Q', 0, false, 'paid',
     null::timestamptz,
     (current_date - 11 + time '15:07') at time zone 'Europe/Amsterdam'),
    ('76c405bb-12c5-4517-af89-bbefdade5da3', 'Consulting Career Night: Alumni Panel',
     'wenjing.li@demo.local', '75Y0TZ0CM6', 0, false, 'paid',
     null::timestamptz,
     (current_date - 9 + time '19:41') at time zone 'Europe/Amsterdam'),
    ('c1ce0c91-1dd4-40ec-888b-c0a6245772e1', 'Consulting Career Night: Alumni Panel',
     'kevin.ng@demo.local', '0V350CXKSP', 0, true, 'paid',
     null::timestamptz,
     (current_date - 7 + time '08:52') at time zone 'Europe/Amsterdam'),
    ('61a857d2-5f0d-4316-af50-cb6031be6d0f', 'Consulting Career Night: Alumni Panel',
     'priya.raghunathan@demo.local', '114AVEP0NQ', 0, false, 'paid',
     null::timestamptz,
     (current_date - 5 + time '17:28') at time zone 'Europe/Amsterdam'),
    ('43d39c04-2249-4996-8367-fae509a04c5e', 'Consulting Career Night: Alumni Panel',
     'chenyu.liu@demo.local', '3ABMQVGYPB', 0, true, 'paid',
     null::timestamptz,
     (current_date - 3 + time '12:16') at time zone 'Europe/Amsterdam'),
    ('05ceb2ee-8c6e-4246-af15-63ef364ed679', 'Consulting Career Night: Alumni Panel',
     'minhao.zhou@demo.local', 'Z5XR34ZPX3', 0, true, 'paid',
     null::timestamptz,
     (current_date - 1 + time '21:09') at time zone 'Europe/Amsterdam'),

    -- Chinese Calligraphy Workshop - 500 member / 900 public cents
    ('26f6456e-3675-4ef5-bd8c-1f7e23624149', 'Chinese Calligraphy Workshop',
     'grace.lam@demo.local', 'NNEFN2JTYM', 500, true, 'paid',
     null::timestamptz,
     (current_date - 6 + time '14:11') at time zone 'Europe/Amsterdam'),
    ('778d5bf1-c40b-4151-872e-e7d99ede54a2', 'Chinese Calligraphy Workshop',
     'anouk.dewit@demo.local', 'NMEF1ZHQ1P', 500, true, 'paid',
     null::timestamptz,
     (current_date - 4 + time '18:33') at time zone 'Europe/Amsterdam'),
    ('2319cd4d-c051-41aa-b4c1-a11b58f80fca', 'Chinese Calligraphy Workshop',
     'bram.meijer@demo.local', 'GJS9X5V0S7', 900, false, 'pending',
     null::timestamptz,
     (current_date - 1 + time '09:47') at time zone 'Europe/Amsterdam'),

    -- Thesis Writing Bootcamp - 400 member / 800 public cents
    ('77d749c7-e2d4-4ce5-ae19-df42bb733f6c', 'Thesis Writing Bootcamp',
     'zixuan.huang@demo.local', '9MEPR7CF7G', 400, true, 'paid',
     null::timestamptz,
     (current_date - 5 + time '13:29') at time zone 'Europe/Amsterdam'),
    ('9a5f30d0-243a-4229-af9d-fb1f3feeef1f', 'Thesis Writing Bootcamp',
     'yara.bouzid@demo.local', 'K5AVNAPQEN', 800, false, 'pending',
     null::timestamptz,
     (current_date - 3 + time '20:02') at time zone 'Europe/Amsterdam'),
    ('a8647c96-2558-467f-8be5-2aa61c3ab738', 'Thesis Writing Bootcamp',
     'peiqi.xu@demo.local', '5N86ZZTBY3', 400, true, 'paid',
     null::timestamptz,
     (current_date - 2 + time '11:44') at time zone 'Europe/Amsterdam'),

    -- Mid-Autumn Festival Gala - 1200 member / 2200 public cents
    ('95f7a6de-2b4b-4f3a-8ba8-42e3d0a366b9', 'Mid-Autumn Festival Gala',
     'member@demo.local', 'FSPDYMR4B2', 1200, true, 'paid',
     null::timestamptz,
     (current_date - 21 + time '19:12') at time zone 'Europe/Amsterdam'),
    ('36571389-5ddf-4145-89b8-2addecbd0497', 'Mid-Autumn Festival Gala',
     'nonmember@demo.local', 'R66WWWG81Q', 2200, false, 'paid',
     null::timestamptz,
     (current_date - 19 + time '10:26') at time zone 'Europe/Amsterdam'),
    ('3e057ecb-13a0-4fa5-9d40-fdc58b2165f9', 'Mid-Autumn Festival Gala',
     'wenjing.li@demo.local', 'B28XDT13TJ', 2200, false, 'pending',
     null::timestamptz,
     (current_date - 17 + time '21:38') at time zone 'Europe/Amsterdam'),
    ('25ffa928-9dd4-45be-a835-aa88f181bcb5', 'Mid-Autumn Festival Gala',
     'jiale.sun@demo.local', 'EWFNA1CZEX', 1200, true, 'paid',
     null::timestamptz,
     (current_date - 15 + time '14:03') at time zone 'Europe/Amsterdam'),
    ('4248ee1f-e395-4063-b275-9217f7dd83d7', 'Mid-Autumn Festival Gala',
     'kevin.ng@demo.local', 'JM9CPA2PWQ', 1200, true, 'paid',
     null::timestamptz,
     (current_date - 13 + time '09:17') at time zone 'Europe/Amsterdam'),
    ('5740b4ad-7b86-48ef-9f50-ed03f7123d88', 'Mid-Autumn Festival Gala',
     'grace.lam@demo.local', '7T9S3T9E4H', 1200, true, 'paid',
     null::timestamptz,
     (current_date - 10 + time '16:44') at time zone 'Europe/Amsterdam'),
    ('c3325324-2290-4af8-9c6f-69570be066b1', 'Mid-Autumn Festival Gala',
     'bram.meijer@demo.local', '2HDG91Q7P0', 2200, false, 'pending',
     null::timestamptz,
     (current_date - 7 + time '22:51') at time zone 'Europe/Amsterdam'),
    ('db452621-60e7-48c5-9c61-082d34b412f0', 'Mid-Autumn Festival Gala',
     'admin@demo.local', '2EFZJJ4DWK', 1200, true, 'paid',
     null::timestamptz,
     (current_date - 5 + time '08:39') at time zone 'Europe/Amsterdam'),  -- the admin pays the member price because she holds a membership, not because she is an admin
    ('dfffc5c9-9398-4f6c-9619-611735125da5', 'Mid-Autumn Festival Gala',
     'staff@demo.local', '1AZH97HKB6', 1200, true, 'paid',
     null::timestamptz,
     (current_date - 2 + time '18:26') at time zone 'Europe/Amsterdam'),

    -- Lunar New Year Gala 2027 - 1500 member / 2750 public cents
    ('ec50c5e2-9889-4862-8502-bb1bf96fa152', 'Lunar New Year Gala 2027',
     'member@demo.local', 'H014AZBPRA', 1500, true, 'paid',
     null::timestamptz,
     (current_date - 4 + time '20:41') at time zone 'Europe/Amsterdam'),
    ('9545ed19-7c55-4d08-8b9a-0440861b65d7', 'Lunar New Year Gala 2027',
     'anouk.dewit@demo.local', 'PHSJGR49DM', 1500, true, 'paid',
     null::timestamptz,
     (current_date - 3 + time '12:58') at time zone 'Europe/Amsterdam'),
    ('effd8b66-5595-4e8e-a351-30371483da9b', 'Lunar New Year Gala 2027',
     'nonmember@demo.local', 'CQ35B6XDM7', 2750, false, 'pending',
     null::timestamptz,
     (current_date - 1 + time '17:22') at time zone 'Europe/Amsterdam'),

    -- Career Trek: Port and Logistics Day - 500 member / 1000 public cents
    --   all four registered before the deadline passed two days ago
    ('e99a34eb-b34d-4769-86d1-6c897d814eca', 'Career Trek: Port and Logistics Day',
     'minhao.zhou@demo.local', 'DAPVVSEPBY', 500, true, 'paid',
     null::timestamptz,
     (current_date - 16 + time '10:04') at time zone 'Europe/Amsterdam'),
    ('18b12f58-3c64-49f8-b898-8e188dd80bb1', 'Career Trek: Port and Logistics Day',
     'chenyu.liu@demo.local', 'ZNMWF1C729', 500, true, 'paid',
     null::timestamptz,
     (current_date - 12 + time '15:33') at time zone 'Europe/Amsterdam'),
    ('bba1a29f-923c-49eb-a082-c958d0092173', 'Career Trek: Port and Logistics Day',
     'nonmember@demo.local', 'H2VAGD115P', 1000, false, 'paid',
     null::timestamptz,
     (current_date - 9 + time '19:18') at time zone 'Europe/Amsterdam'),
    ('5d428845-e216-42f5-bb19-b0dfe82b4825', 'Career Trek: Port and Logistics Day',
     'zixuan.huang@demo.local', 'QHM359WKCR', 500, true, 'paid',
     null::timestamptz,
     (current_date - 4 + time '08:47') at time zone 'Europe/Amsterdam'),

    -- Spring Boat Cruise on the Maas - 1750 member / 2500 public cents
    --   event cancelled: every row refunded
    ('cded2162-9425-4d0b-9ed0-2300307fba85', 'Spring Boat Cruise on the Maas',
     'member@demo.local', 'Z859MNB5RJ', 1750, true, 'refunded',
     null::timestamptz,
     (current_date - 24 + time '11:52') at time zone 'Europe/Amsterdam'),
    ('2370aec8-5eb2-4840-b406-b05577ddd41d', 'Spring Boat Cruise on the Maas',
     'nonmember@demo.local', '1Y1BHY5DQX', 2500, false, 'refunded',
     null::timestamptz,
     (current_date - 22 + time '16:14') at time zone 'Europe/Amsterdam'),
    ('36a7cee0-cc68-4364-8811-69d3fae34666', 'Spring Boat Cruise on the Maas',
     'jiale.sun@demo.local', '727CT35PMA', 1750, true, 'refunded',
     null::timestamptz,
     (current_date - 20 + time '20:37') at time zone 'Europe/Amsterdam')
     ) as v(id, event_title, email, ticket_code, price_paid_cents,
            is_member_price, payment_status, checked_in_at, created_at)
join events e on e.title = v.event_title
join users  u on u.email::text = v.email;

-- -----------------------------------------------------------------------------
-- 5. Payments
--
-- One row per registration that cost money. Free registrations have no payment
-- row at all - that is the point of the free-event branch. Provider is `mock`;
-- no real processor is ever contacted by this prototype.
-- -----------------------------------------------------------------------------
insert into payments (id, registration_id, provider, provider_reference, amount_cents, status, created_at)
select v.id::uuid,
       r.id,
       'mock',
       v.provider_reference,
       v.amount_cents,
       v.status::payment_status,
       v.created_at
from (values
    ('b0803a1b-5f82-4c4f-9610-98c02f4b2caf', '9TYGVW20GN', 'mock_tr_4ef7e5a71834', 750, 'paid',
     (current_date - 52 + time '21:10') at time zone 'Europe/Amsterdam'),
    ('cb2d1c99-793e-4187-b25e-42e7885fe71b', 'TZGBWDASB4', 'mock_tr_03f49a19aa9d', 750, 'paid',
     (current_date - 50 + time '13:25') at time zone 'Europe/Amsterdam'),
    ('c0d9e1a6-84f3-4556-ac7c-7cb0ae17908b', 'V28BJ4HN4W', 'mock_tr_9b8477a3cd4b', 1400, 'paid',
     (current_date - 47 + time '09:51') at time zone 'Europe/Amsterdam'),
    ('55a7e92f-ff01-4764-9173-d5527da90486', 'V8B2VCRRPE', 'mock_tr_a42c9cd49ced', 1400, 'paid',
     (current_date - 45 + time '20:34') at time zone 'Europe/Amsterdam'),
    ('ba5cdf11-f86c-48f2-be75-c76746eb7a71', 'DNYFVMX7Q2', 'mock_tr_656cacbc8ebd', 1400, 'paid',
     (current_date - 44 + time '11:18') at time zone 'Europe/Amsterdam'),
    ('eb9b8642-b8fc-43d5-acde-86a67c240485', '6K5PQJ3J5C', 'mock_tr_85e150369d07', 750, 'paid',
     (current_date - 43 + time '16:05') at time zone 'Europe/Amsterdam'),
    ('d23b5cdb-0c6a-46b3-a533-5f991328a840', '1Z8KPEDKQZ', 'mock_tr_e40f184a73e6', 1400, 'failed',
     (current_date - 42 + time '22:50') at time zone 'Europe/Amsterdam'),  -- declined by the mock issuer
    ('7e32121b-0ae7-4b44-923a-3db3efee893f', 'P03AKR1WAG', 'mock_tr_e291d6584c3c', 500, 'paid',
     (current_date - 31 + time '17:44') at time zone 'Europe/Amsterdam'),
    ('597c8461-3c38-4526-9a28-8f684e665f94', 'NHNM8NRJYX', 'mock_tr_6f7437c9c3de', 500, 'pending',
     (current_date - 29 + time '23:15') at time zone 'Europe/Amsterdam'),
    ('95fa5841-1b78-4a81-af6b-95c44d14a588', 'V63V3SP69H', 'mock_tr_a0c8d265cb2e', 300, 'paid',
     (current_date - 20 + time '18:47') at time zone 'Europe/Amsterdam'),
    ('09847eaa-a7d4-4c8f-b40d-30eac00156d3', 'Y1YJS987YR', 'mock_tr_33ef0566b68f', 300, 'paid',
     (current_date - 18 + time '12:22') at time zone 'Europe/Amsterdam'),
    ('a73f014c-f416-435a-b452-e8f3c3886d5b', '76JZ383BS9', 'mock_tr_3ca9ce1f776e', 600, 'paid',
     (current_date - 16 + time '21:36') at time zone 'Europe/Amsterdam'),
    ('ceacd6a2-1d4c-4c16-9f5b-cf4fc37fc7e3', 'K06CH33EK4', 'mock_tr_d48c6b7ff1b5', 300, 'paid',
     (current_date - 14 + time '10:50') at time zone 'Europe/Amsterdam'),
    ('81629d6b-0f64-447f-87bf-4ba782e72110', 'TAC62H180F', 'mock_tr_3775d1bad634', 600, 'paid',
     (current_date - 181 + time '19:29') at time zone 'Europe/Amsterdam'),
    ('0f0f8a9a-9131-45fc-9fdf-7529c7146499', 'QMR3AEXVNG', 'mock_tr_c1df7fdf8833', 1100, 'paid',
     (current_date - 179 + time '08:36') at time zone 'Europe/Amsterdam'),
    ('54df3e15-c93d-418e-b0d0-c77da92c38ce', 'XTXC0J6ZB1', 'mock_tr_cfc2b80d8f44', 600, 'paid',
     (current_date - 177 + time '14:01') at time zone 'Europe/Amsterdam'),
    ('4abebdc8-9fe0-4b85-8cc7-9f087e0b2986', 'XB30BTCJ23', 'mock_tr_bbb0aa490072', 1100, 'refunded',
     (current_date - 175 + time '20:14') at time zone 'Europe/Amsterdam'),  -- refunded when the cruise was cancelled
    ('228e8d0a-ec2f-431b-88ba-ba735fe5af9e', '0F5YRFE3HH', 'mock_tr_a236f04ca99d', 900, 'paid',
     (current_date - 18 + time '09:15') at time zone 'Europe/Amsterdam'),
    ('466f5cdb-605e-40bd-8425-a5c7718763dc', '1BK4EFM0MY', 'mock_tr_98210b1c2617', 1600, 'paid',
     (current_date - 17 + time '14:41') at time zone 'Europe/Amsterdam'),
    ('dfa15acc-24b8-4887-9041-e2d2c3a2b0bb', 'F06E2WJHYA', 'mock_tr_4700272bbe85', 1600, 'pending',
     (current_date - 16 + time '20:07') at time zone 'Europe/Amsterdam'),
    ('478316ca-7488-4a6d-bc0c-7c255085b148', 'QQ9YZZWGYH', 'mock_tr_dea2aa209fbf', 900, 'paid',
     (current_date - 15 + time '11:30') at time zone 'Europe/Amsterdam'),
    ('edfb00af-fb1a-4b79-a386-cd47c45e7e3d', 'PANSYD404N', 'mock_tr_3f325c2a1f4b', 1600, 'paid',
     (current_date - 14 + time '18:56') at time zone 'Europe/Amsterdam'),
    ('dbb0c1f9-ed19-450c-aa9f-bc33c90bce68', 'KMHGX5RDWQ', 'mock_tr_441cb657a88b', 900, 'paid',
     (current_date - 12 + time '10:44') at time zone 'Europe/Amsterdam'),
    ('39f56289-a050-48ee-89fd-ebcd39636bb8', '60A402482Y', 'mock_tr_d541d0438070', 900, 'pending',
     (current_date - 11 + time '22:19') at time zone 'Europe/Amsterdam'),
    ('677ed2a5-1121-44ac-8970-da988753e487', 'WCDHJGY4YE', 'mock_tr_be31e64202ec', 900, 'paid',
     (current_date - 9 + time '13:08') at time zone 'Europe/Amsterdam'),
    ('2973ac7a-c353-4460-a4d7-65d209d11434', '47BSQJ62HW', 'mock_tr_097574d998b6', 900, 'paid',
     (current_date - 8 + time '16:52') at time zone 'Europe/Amsterdam'),
    ('ec73fb1e-9c1e-4032-b585-056248383723', '1M8WTPMD5D', 'mock_tr_c37d7aa6ef1e', 1600, 'pending',
     (current_date - 6 + time '19:25') at time zone 'Europe/Amsterdam'),
    ('2c553c69-ce2b-46e3-8a7b-5c46e7567fa5', 'WQHQJ19C7R', 'mock_tr_3a7d3117d0f3', 900, 'paid',
     (current_date - 4 + time '12:10') at time zone 'Europe/Amsterdam'),
    ('323eaefc-a4e0-4a40-a450-b23b55d4188f', 'FET7FSVXTW', 'mock_tr_a05b56cd76aa', 900, 'paid',
     (current_date - 2 + time '08:34') at time zone 'Europe/Amsterdam'),
    ('441b2ed0-d0f4-46be-b334-484e3a528e02', '6C73KXQ9TZ', 'mock_tr_339845b87c54', 300, 'paid',
     (current_date - 9 + time '17:47') at time zone 'Europe/Amsterdam'),
    ('d8aa6098-021a-4045-93d4-f3f3e3b92ad0', 'HNV8QEGERG', 'mock_tr_c3c8880d520b', 600, 'pending',
     (current_date - 7 + time '21:05') at time zone 'Europe/Amsterdam'),
    ('b73d2a02-cec8-4572-a356-c39b81c4bb86', '0Q5X0YYSXA', 'mock_tr_3f29e9f214c8', 300, 'paid',
     (current_date - 6 + time '10:21') at time zone 'Europe/Amsterdam'),
    ('d20ca691-4667-4760-b215-893b0505ce52', '66K40H1TMZ', 'mock_tr_ce0ea244db5f', 300, 'paid',
     (current_date - 4 + time '15:39') at time zone 'Europe/Amsterdam'),
    ('f138f834-7620-482d-8330-a7be0a9961ef', '5QKH9GDAF7', 'mock_tr_71ad975362b0', 600, 'paid',
     (current_date - 3 + time '19:50') at time zone 'Europe/Amsterdam'),
    ('5ea721f0-b708-4884-87a6-f7bea1b72a83', 'QGWEXA4NNC', 'mock_tr_5b81193e331e', 750, 'paid',
     (current_date - 13 + time '20:18') at time zone 'Europe/Amsterdam'),
    ('44bf90d2-27e0-4b06-bc52-bf84cdb28ca0', 'DJZ46YQ2E0', 'mock_tr_34f386330994', 1400, 'pending',
     (current_date - 11 + time '12:47') at time zone 'Europe/Amsterdam'),
    ('f1c05a16-7f3a-443f-a414-3512c7cdbdeb', 'WD4XXE49VM', 'mock_tr_d87b1243b872', 750, 'paid',
     (current_date - 10 + time '09:32') at time zone 'Europe/Amsterdam'),
    ('c48275d5-487d-467f-8a6d-5fe93a45404b', 'VSNVB88KX8', 'mock_tr_b08476bcd37c', 750, 'paid',
     (current_date - 8 + time '18:10') at time zone 'Europe/Amsterdam'),
    ('3327090f-8c18-4c5a-b4ee-e7c7924352cb', 'B7G3YVW1TE', 'mock_tr_5bc37fce37ac', 1400, 'paid',
     (current_date - 5 + time '14:55') at time zone 'Europe/Amsterdam'),
    ('5ba79fb5-f7ca-4c36-a59f-f097a7c1b790', 'K0RJ3EYQR4', 'mock_tr_1231474495ce', 1400, 'pending',
     (current_date - 3 + time '22:41') at time zone 'Europe/Amsterdam'),
    ('f6c81d75-9a7b-414f-82de-7023c2e7f5e2', '52WZWP86TV', 'mock_tr_6c3b226b1563', 500, 'pending',
     (current_date - 6 + time '20:58') at time zone 'Europe/Amsterdam'),
    ('553e9791-1dcc-4568-ad78-af1e25778d0c', 'C5JKESB1Z0', 'mock_tr_87ff73d6a82b', 500, 'paid',
     (current_date - 2 + time '13:17') at time zone 'Europe/Amsterdam'),
    ('993779be-cf76-414e-bd4e-83b4584ea231', 'NNEFN2JTYM', 'mock_tr_e56623fa4d77', 500, 'paid',
     (current_date - 6 + time '14:14') at time zone 'Europe/Amsterdam'),
    ('48a4dc4a-94d2-4182-a0c1-50ba3a3f1c2a', 'NMEF1ZHQ1P', 'mock_tr_c0f03035e747', 500, 'paid',
     (current_date - 4 + time '18:36') at time zone 'Europe/Amsterdam'),
    ('52f49c97-6908-4480-ad41-8c0f2020c511', 'GJS9X5V0S7', 'mock_tr_5964ffb44387', 900, 'pending',
     (current_date - 1 + time '09:50') at time zone 'Europe/Amsterdam'),
    ('f120a611-b955-464a-8a6e-ed84710d7d6e', '9MEPR7CF7G', 'mock_tr_8cc6c48ff0cd', 400, 'paid',
     (current_date - 5 + time '13:32') at time zone 'Europe/Amsterdam'),
    ('fdb2a82f-30cb-47e0-8475-5e9ea82aa323', 'K5AVNAPQEN', 'mock_tr_ec2e56457e96', 800, 'pending',
     (current_date - 3 + time '20:05') at time zone 'Europe/Amsterdam'),
    ('0a840aa8-8b60-4327-98ad-58856f5e4bb5', '5N86ZZTBY3', 'mock_tr_50a586445868', 400, 'paid',
     (current_date - 2 + time '11:47') at time zone 'Europe/Amsterdam'),
    ('5853ed0b-66fd-4446-a5bc-ed4906e1827f', 'FSPDYMR4B2', 'mock_tr_cd71795b4893', 1200, 'paid',
     (current_date - 21 + time '19:15') at time zone 'Europe/Amsterdam'),
    ('2851185a-2528-4b36-b72e-6599d750b262', 'R66WWWG81Q', 'mock_tr_30061e392bb1', 2200, 'paid',
     (current_date - 19 + time '10:29') at time zone 'Europe/Amsterdam'),
    ('b3438a32-6f67-4395-a1e0-d4191093a6e3', 'B28XDT13TJ', 'mock_tr_bb6c9d69abb6', 2200, 'pending',
     (current_date - 17 + time '21:41') at time zone 'Europe/Amsterdam'),
    ('a3dc99f1-869e-4835-b8d9-2d0d10871cb8', 'EWFNA1CZEX', 'mock_tr_cc871875707f', 1200, 'paid',
     (current_date - 15 + time '14:06') at time zone 'Europe/Amsterdam'),
    ('6420dcbc-b9bc-453a-8d54-62760e161180', 'JM9CPA2PWQ', 'mock_tr_7dba872c6576', 1200, 'paid',
     (current_date - 13 + time '09:20') at time zone 'Europe/Amsterdam'),
    ('b7be2edf-3eb0-4e91-b67b-1602717c8594', '7T9S3T9E4H', 'mock_tr_92db4f93190b', 1200, 'paid',
     (current_date - 10 + time '16:47') at time zone 'Europe/Amsterdam'),
    ('a8f5c5b4-34c3-4f61-a1cf-ea771e5f4c5a', '2HDG91Q7P0', 'mock_tr_083a17902822', 2200, 'pending',
     (current_date - 7 + time '22:54') at time zone 'Europe/Amsterdam'),
    ('de121752-d006-49a1-8912-c8064be55701', '2EFZJJ4DWK', 'mock_tr_cc5056677154', 1200, 'paid',
     (current_date - 5 + time '08:42') at time zone 'Europe/Amsterdam'),
    ('1c341117-0084-4045-bb26-4f070d434a28', '1AZH97HKB6', 'mock_tr_62c5b468c99d', 1200, 'paid',
     (current_date - 2 + time '18:29') at time zone 'Europe/Amsterdam'),
    ('77c2c013-a05a-49db-83e4-6a4878dcdbed', 'H014AZBPRA', 'mock_tr_8d01b83f58bb', 1500, 'paid',
     (current_date - 4 + time '20:44') at time zone 'Europe/Amsterdam'),
    ('1eb738a3-5faf-41d0-a603-1c56f7961cc4', 'PHSJGR49DM', 'mock_tr_08c863dba94c', 1500, 'paid',
     (current_date - 3 + time '13:01') at time zone 'Europe/Amsterdam'),
    ('41280127-5d6f-46e5-b45b-b5f01fad9e2c', 'CQ35B6XDM7', 'mock_tr_97468c2f5602', 2750, 'pending',
     (current_date - 1 + time '17:25') at time zone 'Europe/Amsterdam'),
    ('a99d888d-77c7-4956-bd95-19920d544743', 'DAPVVSEPBY', 'mock_tr_b854c64a81b2', 500, 'paid',
     (current_date - 16 + time '10:07') at time zone 'Europe/Amsterdam'),
    ('863096fb-6630-4936-9556-a372fe039870', 'ZNMWF1C729', 'mock_tr_b1e755c61624', 500, 'paid',
     (current_date - 12 + time '15:36') at time zone 'Europe/Amsterdam'),
    ('126ef79c-e750-474e-831f-9f6ea5a2897c', 'H2VAGD115P', 'mock_tr_56c5fabe4aed', 1000, 'paid',
     (current_date - 9 + time '19:21') at time zone 'Europe/Amsterdam'),
    ('8a0304d5-df0c-48c1-8811-d8085217035e', 'QHM359WKCR', 'mock_tr_68ab954c2ee7', 500, 'paid',
     (current_date - 4 + time '08:50') at time zone 'Europe/Amsterdam'),
    ('d9917939-2e73-41fc-8d05-04673670d694', 'Z859MNB5RJ', 'mock_tr_96d20cf54bb5', 1750, 'refunded',
     (current_date - 24 + time '11:55') at time zone 'Europe/Amsterdam'),  -- refunded when the cruise was cancelled
    ('0ef39e43-bd69-4a59-aa7f-e22bd6396465', '1Y1BHY5DQX', 'mock_tr_50c2f5a1232a', 2500, 'refunded',
     (current_date - 22 + time '16:17') at time zone 'Europe/Amsterdam'),  -- refunded when the cruise was cancelled
    ('d7d2316d-462b-45b8-adf9-1d3d79a785d7', '727CT35PMA', 'mock_tr_a8cf15c22fc0', 1750, 'refunded',
     (current_date - 20 + time '20:40') at time zone 'Europe/Amsterdam')  -- refunded when the cruise was cancelled
     ) as v(id, ticket_code, provider_reference, amount_cents, status, created_at)
join registrations r on r.ticket_code = v.ticket_code;

-- -----------------------------------------------------------------------------
-- 6. Scan attempts
--
-- Every scan lands here, successful or not - this table is the evidence for the
-- offline-sync story (contract section 4). It contains, deliberately:
--
--   * one duplicate: the same ticket at a second door six minutes later. The
--     registration keeps its ORIGINAL checked_in_at; the second scan is only a
--     row here.
--   * one wrong_event: a valid hotpot ticket presented at the badminton door.
--   * one invalid: a code that was never issued.
--   * two scans where received_at is well after scanned_at - a volunteer's phone
--     queued them offline and uploaded when it found signal. The reported time
--     is the one that counts.
-- -----------------------------------------------------------------------------
insert into scan_attempts (id, ticket_code, event_id, device_id, scanned_at, received_at, outcome, created_at)
select v.id::uuid,
       v.ticket_code,
       e.id,
       v.device_id,
       v.scanned_at,
       v.received_at,
       v.outcome::check_in_outcome,
       v.received_at
from (values
    ('9b601e2d-b7aa-4310-a56a-8b07a86b5303', '9TYGVW20GN', 'Hotpot Night: Sichuan Edition', 'scanner-door-01',
     (current_date - 38 + time '18:34') at time zone 'Europe/Amsterdam',
     (current_date - 38 + time '18:34') at time zone 'Europe/Amsterdam',
     'success'),
    ('2b636d14-5962-484b-a8d4-dac82701a57c', 'TZGBWDASB4', 'Hotpot Night: Sichuan Edition', 'volunteer-phone-a3',
     (current_date - 38 + time '18:41') at time zone 'Europe/Amsterdam',
     (current_date - 38 + time '19:56') at time zone 'Europe/Amsterdam',
     'success'),  -- Offline queue: reported at the door, uploaded 75 minutes later.
    ('128c3c35-9cbc-4b9e-95cf-fb56987f50cc', 'V28BJ4HN4W', 'Hotpot Night: Sichuan Edition', 'scanner-door-01',
     (current_date - 38 + time '18:52') at time zone 'Europe/Amsterdam',
     (current_date - 38 + time '18:52') at time zone 'Europe/Amsterdam',
     'success'),
    ('ba86921c-eed7-4ab4-a889-e6c623176ead', 'V8B2VCRRPE', 'Hotpot Night: Sichuan Edition', 'scanner-door-01',
     (current_date - 38 + time '19:05') at time zone 'Europe/Amsterdam',
     (current_date - 38 + time '19:05') at time zone 'Europe/Amsterdam',
     'success'),
    ('6c17e7b6-f320-4d22-9fab-0049e13b881b', '6K5PQJ3J5C', 'Hotpot Night: Sichuan Edition', 'volunteer-phone-a3',
     (current_date - 38 + time '18:36') at time zone 'Europe/Amsterdam',
     (current_date - 38 + time '19:16') at time zone 'Europe/Amsterdam',
     'success'),  -- Offline queue: reported at the door, uploaded 40 minutes later.
    ('7d801cd2-195d-418d-9e0c-3d0ec4ccc734', 'BB8YG815CD', 'Mandarin Conversation Cafe #12', 'scanner-door-01',
     (current_date - 17 + time '17:03') at time zone 'Europe/Amsterdam',
     (current_date - 17 + time '17:03') at time zone 'Europe/Amsterdam',
     'success'),
    ('3264a6c8-8dcd-4f1d-9476-6d52240cb027', 'PAXVT7E56G', 'Mandarin Conversation Cafe #12', 'scanner-door-01',
     (current_date - 17 + time '17:01') at time zone 'Europe/Amsterdam',
     (current_date - 17 + time '17:01') at time zone 'Europe/Amsterdam',
     'success'),
    ('04105c4f-8f40-4f98-a291-30638be16dfb', 'AEW3QZ0SEF', 'Mandarin Conversation Cafe #12', 'scanner-door-01',
     (current_date - 17 + time '17:11') at time zone 'Europe/Amsterdam',
     (current_date - 17 + time '17:11') at time zone 'Europe/Amsterdam',
     'success'),
    ('88618ae8-ecd8-4349-8634-a538ca7ea6af', 'TTXATB75TY', 'Mandarin Conversation Cafe #12', 'scanner-door-01',
     (current_date - 17 + time '17:06') at time zone 'Europe/Amsterdam',
     (current_date - 17 + time '17:06') at time zone 'Europe/Amsterdam',
     'success'),
    ('d2b6b96e-c384-4e35-9f6a-5d0361e7474d', 'DWBFK4S3PC', 'CV and Cover Letter Clinic', 'scanner-door-01',
     (current_date - 24 + time '16:02') at time zone 'Europe/Amsterdam',
     (current_date - 24 + time '16:02') at time zone 'Europe/Amsterdam',
     'success'),
    ('30b24179-290d-4b93-8855-4b975cf503ad', 'P03AKR1WAG', 'CV and Cover Letter Clinic', 'scanner-door-01',
     (current_date - 24 + time '16:09') at time zone 'Europe/Amsterdam',
     (current_date - 24 + time '16:09') at time zone 'Europe/Amsterdam',
     'success'),
    ('8e7cb025-85f8-4861-a24a-ff7987b56a09', '33SDG85189', 'CV and Cover Letter Clinic', 'scanner-door-01',
     (current_date - 24 + time '15:58') at time zone 'Europe/Amsterdam',
     (current_date - 24 + time '15:58') at time zone 'Europe/Amsterdam',
     'success'),
    ('937298e3-322c-4f75-adca-80e32224a930', 'V63V3SP69H', 'Badminton Ladder - Round 3', 'scanner-door-01',
     (current_date - 11 + time '19:58') at time zone 'Europe/Amsterdam',
     (current_date - 11 + time '19:58') at time zone 'Europe/Amsterdam',
     'success'),
    ('1f05624c-00c8-4425-a4ab-5e37bf345a73', 'Y1YJS987YR', 'Badminton Ladder - Round 3', 'scanner-door-01',
     (current_date - 11 + time '20:03') at time zone 'Europe/Amsterdam',
     (current_date - 11 + time '20:03') at time zone 'Europe/Amsterdam',
     'success'),
    ('4f91f7ef-2c2c-4708-8863-6e39c6b6c8c0', '76JZ383BS9', 'Badminton Ladder - Round 3', 'scanner-door-01',
     (current_date - 11 + time '20:07') at time zone 'Europe/Amsterdam',
     (current_date - 11 + time '20:07') at time zone 'Europe/Amsterdam',
     'success'),
    ('c44ea07a-90a5-45fe-a398-4c6357f576fa', 'TAC62H180F', 'Dumpling Making Workshop', 'scanner-door-01',
     (current_date - 168 + time '15:04') at time zone 'Europe/Amsterdam',
     (current_date - 168 + time '15:04') at time zone 'Europe/Amsterdam',
     'success'),
    ('09a7da5c-1a7b-434f-9097-868475bc886c', 'QMR3AEXVNG', 'Dumpling Making Workshop', 'scanner-door-01',
     (current_date - 168 + time '15:02') at time zone 'Europe/Amsterdam',
     (current_date - 168 + time '15:02') at time zone 'Europe/Amsterdam',
     'success'),
    ('d0b63c7d-7b81-4f69-9c07-100c62d68366', 'XTXC0J6ZB1', 'Dumpling Making Workshop', 'scanner-door-01',
     (current_date - 168 + time '15:09') at time zone 'Europe/Amsterdam',
     (current_date - 168 + time '15:09') at time zone 'Europe/Amsterdam',
     'success'),
    ('75be148d-d566-4bff-a8d5-c3467bb7d763', '9TYGVW20GN', 'Hotpot Night: Sichuan Edition', 'scanner-door-02',
     (current_date - 38 + time '18:40') at time zone 'Europe/Amsterdam',
     (current_date - 38 + time '18:40') at time zone 'Europe/Amsterdam',
     'duplicate'),  -- Same ticket, second door, six minutes later. checked_in_at keeps the first time.
    ('ed5ad96a-7e3a-462f-bea5-533d99e369b5', 'V8B2VCRRPE', 'Badminton Ladder - Round 3', 'scanner-door-01',
     (current_date - 11 + time '20:11') at time zone 'Europe/Amsterdam',
     (current_date - 11 + time '20:11') at time zone 'Europe/Amsterdam',
     'wrong_event'),  -- A valid hotpot ticket presented at the badminton door.
    ('e05844a5-ccdb-48a4-b5fe-4013749eea39', 'ZZ40N7QX2M', 'Badminton Ladder - Round 3', 'scanner-door-01',
     (current_date - 11 + time '20:14') at time zone 'Europe/Amsterdam',
     (current_date - 11 + time '20:14') at time zone 'Europe/Amsterdam',
     'invalid')  -- Code that has never been issued - a screenshot of somebody else's screenshot.
     ) as v(id, ticket_code, event_title, device_id, scanned_at, received_at, outcome)
join events e on e.title = v.event_title;

-- -----------------------------------------------------------------------------
-- 7. Partners
--
-- Twelve invented businesses across the Rotterdam area. Every name, address and
-- discount is fictional; no real business is named, endorsed or implied. Streets
-- and postcodes are plausible-looking rather than looked up.
-- -----------------------------------------------------------------------------
insert into partners (id, name, city, category, discount_text, address) values
    ('9e43c4bc-857e-4694-9289-cb263e9967ec', 'Jade Lantern Kitchen', 'Rotterdam', 'food',
     '10% off the a la carte menu, Monday to Thursday', 'Zeilmakerskade 12, 3072 Rotterdam'),
    ('c8629367-7739-4bca-bd65-988f3a2dc80f', 'Bubble and Brew Teahouse', 'Rotterdam', 'food',
     'Free topping upgrade on any large drink', 'Pakhuisstraat 47, 3011 Rotterdam'),
    ('ddb6a137-787a-4e48-b3f8-b31f58d0ec51', 'Golden Crane Toko', 'Rotterdam', 'groceries',
     '5% off purchases over EUR 25', 'Kompasstraat 118, 3021 Rotterdam'),
    ('05d740d4-a3d6-4120-bb26-1e78bfb1e62a', 'Sunrise Noodle Bar', 'Rotterdam', 'food',
     'Student menu for EUR 9,50 on presentation of the membership card', 'Meridiaanplein 6, 3011 Rotterdam'),
    ('484a9d35-84a1-4218-b1b2-78795f88622c', 'Coolhaven Barbers', 'Rotterdam', 'beauty',
     'EUR 3 off a cut from Monday to Wednesday', 'Sluiswachterstraat 3, 3024 Rotterdam'),
    ('329d45f7-6ac8-48e4-b967-3f4846fe626b', 'Delta Bike Repair', 'Rotterdam', 'services',
     'Free tyre and brake check, 15% off any repair', 'Vlietkade 88, 3033 Rotterdam'),
    ('34f16da7-c5df-4af9-8a60-b9be2dc73380', 'Mandarin Bridge Language Studio', 'Rotterdam', 'education',
     'First trial lesson free, 10% off any term course', 'Pakhuisstraat 2A, 3011 Rotterdam'),
    ('f0bdf8b9-65f9-4d63-b5a1-c5da9001c07d', 'Maas Fitness Collective', 'Rotterdam', 'sports',
     'No registration fee and EUR 5 off the monthly student membership', 'Havenmeesterweg 21, 3072 Rotterdam'),
    ('d8e8ba4e-c981-4478-968b-8081bc8cef65', 'Panda Print and Bind', 'Rotterdam', 'services',
     '20% off thesis printing and hard binding', 'Boekbindersstraat 9, 3012 Rotterdam'),
    ('a138a56c-ef20-4204-b217-b7bd2f6633cc', 'Lotus Nail Studio', 'Schiedam', 'beauty',
     '10% off all treatments, by appointment', 'Wolwevershof 14, 3111 Schiedam'),
    ('b1327397-4f4f-44f6-b1e2-a12b4c7717eb', 'Second Chapter Books', 'Delft', 'retail',
     '15% off second-hand study books, 10% off new', 'Molenwerfstraat 5, 2611 Delft'),
    ('d2153954-b7a8-4a55-baf5-f36219088212', 'Neon Alley Karaoke', 'Capelle aan den IJssel', 'nightlife',
     'One free hour on weekday bookings before 20:00', 'Rivierstaete 30, 2903 Capelle aan den IJssel');

-- -----------------------------------------------------------------------------
-- 8. Audit events
--
-- What the trail would already contain by the time the demo is opened: events
-- drafted and published, a cancellation with its reason, a membership renewal,
-- a handful of registrations, a failed card, and one manual check-in override
-- carrying the admin identity and the reason the business rules require.
-- -----------------------------------------------------------------------------
insert into audit_events (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
select v.id::uuid,
       u.id,
       v.action,
       v.entity_type,
       v.entity_id::uuid,
       v.metadata::jsonb,
       v.created_at
from (values
    ('67972e5b-34b4-427d-847d-b026055d8630', 'admin@demo.local', 'event.created', 'event', 'c96232df-058c-4eed-a361-401ec0280cd8',
     '{"title": "Mid-Autumn Festival Gala", "category": "cultural"}',
     (current_date - 28 + time '11:04') at time zone 'Europe/Amsterdam'),
    ('a567aabf-ed6e-4f0b-b1dd-3fc3cd2f09f7', 'admin@demo.local', 'event.published', 'event', 'c96232df-058c-4eed-a361-401ec0280cd8',
     '{"capacity": 180, "priceMemberCents": 1200, "pricePublicCents": 2200}',
     (current_date - 27 + time '09:22') at time zone 'Europe/Amsterdam'),
    ('5896044c-33a5-4ed8-bbda-1110cf93b74e', 'staff@demo.local', 'event.created', 'event', '15403cb1-02f5-4587-91f6-5dc263b33903',
     '{"title": "Hotpot and Mahjong Night", "category": "social"}',
     (current_date - 20 + time '16:41') at time zone 'Europe/Amsterdam'),
    ('254f7187-b467-409c-9c75-b345467c36ae', 'admin@demo.local', 'event.published', 'event', '15403cb1-02f5-4587-91f6-5dc263b33903',
     '{"capacity": 60, "priceMemberCents": 750, "pricePublicCents": 1400}',
     (current_date - 19 + time '10:13') at time zone 'Europe/Amsterdam'),
    ('6ae92862-d52c-4a2c-8996-fd9184653314', 'peiqi.xu@demo.local', 'event.published', 'event', '97e5d585-4b19-4a20-8654-c06e4a45f73f',
     '{"capacity": 12, "priceMemberCents": 900, "pricePublicCents": 1600}',
     (current_date - 20 + time '13:37') at time zone 'Europe/Amsterdam'),
    ('625c7dc1-5935-4bd9-8365-5767d381aac7', 'admin@demo.local', 'event.status_changed', 'event', '97e5d585-4b19-4a20-8654-c06e4a45f73f',
     '{"from": "published", "to": "sold_out", "registrations": 12, "capacity": 12}',
     (current_date - 2 + time '08:33') at time zone 'Europe/Amsterdam'),
    ('7ba36275-0d18-4480-858e-d9ccaae465a5', 'admin@demo.local', 'event.cancelled', 'event', 'f4a1fe16-fc71-4516-9b40-4afa8a32ac11',
     '{"reason": "Charter operator withdrew the boat and no replacement was available for the date", "refundedRegistrations": 3, "refundedCentsTotal": 6000}',
     (current_date - 12 + time '15:08') at time zone 'Europe/Amsterdam'),
    ('61a2e4db-45ef-4dc1-8908-2f94668804c1', 'admin@demo.local', 'registration.refunded', 'registration', 'cded2162-9425-4d0b-9ed0-2300307fba85',
     '{"reason": "Event cancelled", "amountCents": 1750, "ticketCode": "Z859MNB5RJ"}',
     (current_date - 12 + time '15:11') at time zone 'Europe/Amsterdam'),
    ('6e300ba3-e6e4-479a-a9ee-c7fb92b3d519', 'admin@demo.local', 'membership.renewed', 'membership_period', 'c45b8f85-3631-4a15-b818-6e72183f8089',
     '{"memberNumber": "CSA-006190", "previousMemberNumber": "CSA-004821", "membershipType": "general", "lapsedMonths": 3}',
     (current_date - 150 + time '12:26') at time zone 'Europe/Amsterdam'),
    ('472564f7-3113-481e-9279-491649d3cd76', 'member@demo.local', 'registration.created', 'registration', '95f7a6de-2b4b-4f3a-8ba8-42e3d0a366b9',
     '{"eventTitle": "Mid-Autumn Festival Gala", "ticketCode": "FSPDYMR4B2", "isMemberPrice": true, "pricePaidCents": 1200}',
     (current_date - 21 + time '19:12') at time zone 'Europe/Amsterdam'),
    ('a4e0e367-6ddd-4ce3-9939-c12d634815fc', 'nonmember@demo.local', 'registration.created', 'registration', '36571389-5ddf-4145-89b8-2addecbd0497',
     '{"eventTitle": "Mid-Autumn Festival Gala", "ticketCode": "R66WWWG81Q", "isMemberPrice": false, "pricePaidCents": 2200}',
     (current_date - 19 + time '10:26') at time zone 'Europe/Amsterdam'),
    ('7b6ca10a-8dae-418d-a90d-380cbf42ec7e', 'wenjing.li@demo.local', 'registration.created', 'registration', '76c405bb-12c5-4517-af89-bbefdade5da3',
     '{"eventTitle": "Consulting Career Night: Alumni Panel", "ticketCode": "75Y0TZ0CM6", "isMemberPrice": false, "pricePaidCents": 0, "note": "Membership expired four months ago; free event so the public price is also 0"}',
     (current_date - 9 + time '19:41') at time zone 'Europe/Amsterdam'),
    ('5afd9491-f13c-402f-9bb6-4fb73fc23d39', 'admin@demo.local', 'registration.checked_in.manual_override', 'registration', 'ee910ccd-718a-4f39-a2f6-4c2f0cc82765',
     '{"reason": "Phone battery dead at the door; identity confirmed against the paper list", "ticketCode": "V8B2VCRRPE", "deviceId": "scanner-door-01"}',
     (current_date - 38 + time '19:05') at time zone 'Europe/Amsterdam'),
    ('34ebb7ef-53cc-4ac2-9677-44e3a4c38ab3', 'admin@demo.local', 'registration.payment_failed', 'registration', '157b15f4-df7c-4fb5-bb0f-935faf2bd6e3',
     '{"provider": "mock", "reason": "issuer_declined", "amountCents": 1400}',
     (current_date - 42 + time '22:49') at time zone 'Europe/Amsterdam'),
    ('7e46eac1-9f3b-4b15-9977-36ff5d29fb6c', 'admin@demo.local', 'partner.created', 'partner', '9e43c4bc-857e-4694-9289-cb263e9967ec',
     '{"name": "Jade Lantern Kitchen", "city": "Rotterdam", "category": "food"}',
     (current_date - 75 + time '14:55') at time zone 'Europe/Amsterdam'),
    ('29e2aa98-6c58-4942-8d6e-292d13118d34', 'staff@demo.local', 'event.created', 'event', '084cb5e2-dd44-42ff-bcd7-144a85b8283d',
     '{"title": "[DEMO ONLY] Concurrency Test - Single Seat", "capacity": 1, "note": "Fixture for the capacity race demonstration - not a real event"}',
     (current_date - 8 + time '17:02') at time zone 'Europe/Amsterdam')
     ) as v(id, actor_email, action, entity_type, entity_id, metadata, created_at)
join users u on u.email::text = v.actor_email;

-- -----------------------------------------------------------------------------
-- 9. Analytics events
--
-- All eight names from the closed set in contract section 4, arranged as real
-- funnels rather than as loose rows: a member and a non-member each viewing,
-- starting and completing a registration for the same gala at different prices;
-- a card that failed before a registration was ever paid; and a door sequence
-- that goes attempted -> succeeded, then attempted -> rejected on the duplicate.
--
-- `user_id` is null on the guest views. Those are the unauthenticated visitors
-- from contract section 2, who have no row anywhere else.
-- -----------------------------------------------------------------------------
insert into analytics_events (id, name, user_id, properties, created_at)
select v.id::uuid,
       v.name,
       u.id,
       v.properties::jsonb,
       v.created_at
from (values
    ('28ac976d-90fa-45e4-8bdc-0e9f4f747296', 'event_viewed', null,
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "surface": "web_public"}',
     (current_date - 22 + time '21:48') at time zone 'Europe/Amsterdam'),  -- guest: unauthenticated visitor, no user row anywhere
    ('1b55860c-e744-4f84-a913-53a68887d890', 'event_viewed', 'member@demo.local',
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "surface": "mobile_home"}',
     (current_date - 21 + time '19:06') at time zone 'Europe/Amsterdam'),
    ('f9b923de-158b-4049-ac69-748969d6c227', 'registration_started', 'member@demo.local',
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "surface": "mobile_event_detail"}',
     (current_date - 21 + time '19:10') at time zone 'Europe/Amsterdam'),
    ('e5ca53e4-a31f-40c7-a77b-cd86faae9362', 'registration_completed', 'member@demo.local',
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "registrationId": "95f7a6de-2b4b-4f3a-8ba8-42e3d0a366b9", "isMemberPrice": true, "pricePaidCents": 1200}',
     (current_date - 21 + time '19:12') at time zone 'Europe/Amsterdam'),
    ('4d397fad-8a3a-41f5-9749-0ec44bf4ae23', 'ticket_opened', 'member@demo.local',
     '{"registrationId": "95f7a6de-2b4b-4f3a-8ba8-42e3d0a366b9", "surface": "mobile_wallet"}',
     (current_date - 20 + time '08:14') at time zone 'Europe/Amsterdam'),
    ('42c7822e-7fc6-4bff-86cb-58bb419580c2', 'event_viewed', 'nonmember@demo.local',
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "surface": "mobile_search"}',
     (current_date - 19 + time '10:19') at time zone 'Europe/Amsterdam'),
    ('04c18997-5d91-476b-a844-fae8abfe52c5', 'registration_started', 'nonmember@demo.local',
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "surface": "mobile_event_detail"}',
     (current_date - 19 + time '10:22') at time zone 'Europe/Amsterdam'),
    ('a1a5cb22-b73e-490c-b5e6-4c4320ae6146', 'registration_completed', 'nonmember@demo.local',
     '{"eventId": "c96232df-058c-4eed-a361-401ec0280cd8", "registrationId": "36571389-5ddf-4145-89b8-2addecbd0497", "isMemberPrice": false, "pricePaidCents": 2200}',
     (current_date - 19 + time '10:26') at time zone 'Europe/Amsterdam'),
    ('a1f55a5c-3abb-4748-951d-9f5a78c75f56', 'event_viewed', 'yara.bouzid@demo.local',
     '{"eventId": "4b0f665b-ca9d-4964-9bf6-7e7d128e3730", "surface": "mobile_home"}',
     (current_date - 42 + time '22:41') at time zone 'Europe/Amsterdam'),
    ('08763a45-dad3-4a23-a5af-1a3bd5673977', 'registration_started', 'yara.bouzid@demo.local',
     '{"eventId": "4b0f665b-ca9d-4964-9bf6-7e7d128e3730", "surface": "mobile_event_detail"}',
     (current_date - 42 + time '22:45') at time zone 'Europe/Amsterdam'),
    ('b50790c0-8938-4b5b-9304-885b1016020e', 'payment_failed', 'yara.bouzid@demo.local',
     '{"registrationId": "157b15f4-df7c-4fb5-bb0f-935faf2bd6e3", "provider": "mock", "reason": "issuer_declined", "amountCents": 1400}',
     (current_date - 42 + time '22:48') at time zone 'Europe/Amsterdam'),
    ('f76546c1-ba0b-4654-80a5-1aecf5294e61', 'event_viewed', null,
     '{"eventId": "c02ab5e6-acd0-4b60-a75f-56bcc8648316", "surface": "web_public"}',
     (current_date - 14 + time '12:31') at time zone 'Europe/Amsterdam'),  -- guest: unauthenticated visitor, no user row anywhere
    ('65058597-0f4d-4b72-b720-9cfdc193730a', 'event_viewed', 'bram.meijer@demo.local',
     '{"eventId": "97e5d585-4b19-4a20-8654-c06e4a45f73f", "surface": "mobile_home"}',
     (current_date - 6 + time '19:15') at time zone 'Europe/Amsterdam'),
    ('06ac0e3d-52d1-464c-93d9-af452c2293a8', 'registration_started', 'bram.meijer@demo.local',
     '{"eventId": "97e5d585-4b19-4a20-8654-c06e4a45f73f", "surface": "mobile_event_detail"}',
     (current_date - 6 + time '19:19') at time zone 'Europe/Amsterdam'),
    ('de8f66ee-6f69-4bd7-b587-85cbcc26b07b', 'registration_completed', 'bram.meijer@demo.local',
     '{"eventId": "97e5d585-4b19-4a20-8654-c06e4a45f73f", "registrationId": "aaea5bc2-8030-4966-88f8-d816753f4f82", "isMemberPrice": false, "pricePaidCents": 1600}',
     (current_date - 6 + time '19:22') at time zone 'Europe/Amsterdam'),
    ('bf895f40-dabb-47e6-80cc-191eb2542032', 'ticket_opened', 'bram.meijer@demo.local',
     '{"registrationId": "aaea5bc2-8030-4966-88f8-d816753f4f82", "surface": "mobile_wallet"}',
     (current_date - 5 + time '09:41') at time zone 'Europe/Amsterdam'),
    ('c9119970-8eec-4da6-8f9f-495ef938a5b6', 'check_in_attempted', 'staff@demo.local',
     '{"eventId": "4b0f665b-ca9d-4964-9bf6-7e7d128e3730", "deviceId": "scanner-door-01", "ticketCode": "9TYGVW20GN"}',
     (current_date - 38 + time '18:34') at time zone 'Europe/Amsterdam'),
    ('92a57ec4-79a5-4b04-9c06-14fccce34ea3', 'check_in_succeeded', 'staff@demo.local',
     '{"eventId": "4b0f665b-ca9d-4964-9bf6-7e7d128e3730", "deviceId": "scanner-door-01", "ticketCode": "9TYGVW20GN"}',
     (current_date - 38 + time '18:34') at time zone 'Europe/Amsterdam'),
    ('cf0a9c58-f284-4e53-983c-7c595976ee58', 'check_in_attempted', 'peiqi.xu@demo.local',
     '{"eventId": "4b0f665b-ca9d-4964-9bf6-7e7d128e3730", "deviceId": "scanner-door-02", "ticketCode": "9TYGVW20GN"}',
     (current_date - 38 + time '18:40') at time zone 'Europe/Amsterdam'),
    ('bf18b9e3-0e09-4a90-9d39-fc5cb3d9c059', 'check_in_rejected', 'peiqi.xu@demo.local',
     '{"eventId": "4b0f665b-ca9d-4964-9bf6-7e7d128e3730", "deviceId": "scanner-door-02", "outcome": "duplicate", "ticketCode": "9TYGVW20GN"}',
     (current_date - 38 + time '18:40') at time zone 'Europe/Amsterdam'),
    ('c802bdcc-b55d-4256-828c-f32545d11d15', 'check_in_attempted', 'staff@demo.local',
     '{"eventId": "2f8e4f30-35d8-49b1-af86-9be96fd5c517", "deviceId": "scanner-door-01", "ticketCode": "V8B2VCRRPE"}',
     (current_date - 11 + time '20:11') at time zone 'Europe/Amsterdam'),
    ('1db9cc80-e91b-453a-b019-0f994d0036b4', 'check_in_rejected', 'staff@demo.local',
     '{"eventId": "2f8e4f30-35d8-49b1-af86-9be96fd5c517", "deviceId": "scanner-door-01", "outcome": "wrong_event", "ticketCode": "V8B2VCRRPE"}',
     (current_date - 11 + time '20:11') at time zone 'Europe/Amsterdam'),
    ('8cc5714e-ac45-4a77-876f-41be17571819', 'check_in_rejected', 'staff@demo.local',
     '{"eventId": "2f8e4f30-35d8-49b1-af86-9be96fd5c517", "deviceId": "scanner-door-01", "outcome": "invalid", "ticketCode": "ZZ40N7QX2M"}',
     (current_date - 11 + time '20:14') at time zone 'Europe/Amsterdam'),
    ('63fc64e0-c304-4d85-8683-cf2878dc4f3a', 'event_viewed', null,
     '{"eventId": "ecf69fda-b950-4758-bcf9-5c7f7149beba", "surface": "web_public"}',
     (current_date - 3 + time '13:02') at time zone 'Europe/Amsterdam'),  -- guest: unauthenticated visitor, no user row anywhere
    ('a1460507-a459-4f98-b6f3-64253a8af0ad', 'event_viewed', 'anouk.dewit@demo.local',
     '{"eventId": "ecf69fda-b950-4758-bcf9-5c7f7149beba", "surface": "mobile_home"}',
     (current_date - 3 + time '12:51') at time zone 'Europe/Amsterdam'),
    ('59d12e35-2b47-46eb-b710-9d0f368cc83e', 'registration_started', 'anouk.dewit@demo.local',
     '{"eventId": "ecf69fda-b950-4758-bcf9-5c7f7149beba", "surface": "mobile_event_detail"}',
     (current_date - 3 + time '12:55') at time zone 'Europe/Amsterdam'),
    ('3c42d44c-dce8-4cd8-baea-660605448149', 'registration_completed', 'anouk.dewit@demo.local',
     '{"eventId": "ecf69fda-b950-4758-bcf9-5c7f7149beba", "registrationId": "9545ed19-7c55-4d08-8b9a-0440861b65d7", "isMemberPrice": true, "pricePaidCents": 1500}',
     (current_date - 3 + time '12:58') at time zone 'Europe/Amsterdam'),
    ('91262dfb-ff02-41c0-9f0e-293482fc0df9', 'ticket_opened', 'wenjing.li@demo.local',
     '{"registrationId": "76c405bb-12c5-4517-af89-bbefdade5da3", "surface": "mobile_wallet"}',
     (current_date - 8 + time '07:52') at time zone 'Europe/Amsterdam'),
    ('ce9be066-2244-4ae2-81fb-d67d75e7b3cc', 'event_viewed', null,
     '{"eventId": "97e5d585-4b19-4a20-8654-c06e4a45f73f", "surface": "web_public"}',
     (current_date - 5 + time '18:07') at time zone 'Europe/Amsterdam')  -- guest: unauthenticated visitor, no user row anywhere
     ) as v(id, name, email, properties, created_at)
left join users u on u.email::text = v.email;

commit;

-- =============================================================================
-- What is in here
--
--   users                 16   (1 admin, 2 staff, 13 attendee)
--   membership_periods    14   (11 active, 2 expired, 1 cancelled)
--   events                18   (15 published, 1 draft, 1 sold out, 1 cancelled)
--   registrations         83   (65 paid, 13 pending, 1 failed, 4 refunded)
--                              50 at member price, 33 at public price, 18 checked in
--   payments              67
--   scan_attempts         21   (18 success, 1 duplicate, 1 wrong_event, 1 invalid)
--   partners              12
--   audit_events          16
--   analytics_events      29
--
-- Demo identities (contract section 7):
--   member@demo.local     active general membership, expires in seven months
--   nonmember@demo.local  registered, no membership period at all
--   admin@demo.local      role admin
--   staff@demo.local      role staff
--
-- Auth is seeded sessions. These addresses are `.local` and undeliverable by
-- design - no magic link can ever be sent to them.
-- =============================================================================
