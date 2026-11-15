-- Reference diagrams for seed exercises (docs/DECISIONS.md): hotlinked
-- Wikimedia Commons THUMBNAIL urls (~250px wide), all from the Everkinetic
-- set (CC BY-SA 3.0) so every diagram shares the same line-art style.
-- Thumbnails, not full-res originals (some originals are 250-400KB — absurd
-- for a 64px UI thumbnail). SVG-sourced diagrams use the rendered PNG thumb
-- URL, not the raw .svg: Wikimedia serves raw SVGs as text/plain, which
-- doesn't render via <img src>. Face Pull has no matching Everkinetic
-- diagram and is left without an image.

update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Squats-1.png/250px-Squats-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000001';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Front-squat-1-857x1024.png/250px-Front-squat-1-857x1024.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000002';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Leg-press-1-1024x670.png/250px-Leg-press-1-1024x670.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000003';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Romanian-deadlift-1.png/250px-Romanian-deadlift-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000004';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Dead-lifts-1.png/250px-Dead-lifts-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000005';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Leg-extensions-1-672x1024.png/250px-Leg-extensions-1-672x1024.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000006';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Seated-leg-curl-1.png/250px-Seated-leg-curl-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000007';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/3/30/Calf-raises-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000008';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Bench-press-1.png/250px-Bench-press-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000009';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Incline-bench-press-1.png/250px-Incline-bench-press-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-00000000000a';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Dumbbell-bench-press-1.png/250px-Dumbbell-bench-press-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-00000000000b';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Seated-military-shoulder-press-1.png/250px-Seated-military-shoulder-press-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-00000000000c';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Lateral_dumbbell_raises_1.svg/250px-Lateral_dumbbell_raises_1.svg.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-00000000000d';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Reverse_grips_bent_over_barbell_rows_1.svg/250px-Reverse_grips_bent_over_barbell_rows_1.svg.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-00000000000e';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Cable-seated-rows-1.png/250px-Cable-seated-rows-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-00000000000f';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Underhand_pull_down_1.svg/250px-Underhand_pull_down_1.svg.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000010';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Chin-ups-1.png/250px-Chin-ups-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000011';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/b/bf/Bicep-curl-1.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000012';
update "exercises" set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Triceps_pushdown_with_cable_1.svg/250px-Triceps_pushdown_with_cable_1.svg.png', image_attribution = 'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons' where id = '00000000-0000-4000-8000-000000000013';
-- Face Pull ('...0014'): no matching Everkinetic diagram, left without an image.
