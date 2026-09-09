import type { OmniChatGenerationJob } from '../types/omnichat';

/**
 * A percentage that keeps moving.
 *
 * `job.progress` cannot be shown directly. The queue adds to it per poll and
 * caps it -- 5 to 90 for a single-phase job, 5 to 40 to 90 for a video's two
 * phases -- so it reaches its ceiling in about thirty seconds and then sits
 * there. On an image that roughly coincides with the render finishing. On a
 * video it means eight to fifteen minutes of "90%", which reads as a frozen
 * job; it did to us, repeatedly, which is why this was an elapsed clock before.
 *
 * So the phase comes from the server and the movement comes from the clock: the
 * job says which band it is in, and elapsed time walks across that band on a
 * curve that halves the remaining distance every median duration. It always
 * rises, it never stalls, and it never reaches the top of its band -- because
 * the only honest source of "finished" is the job saying so.
 */

/**
 * Measured, not guessed: the median seconds from started_at to completed_at
 * across every succeeded job in the database, by kind and mode.
 *
 *   image/create               20        image/likeness            45
 *   image/contextual           25        image/likeness_reference  82
 *   video/image_to_video      487        video/contextual         875
 *
 * The spread around these is wide -- a contextual image has finished in 9
 * seconds and taken 355 -- which is exactly why the curve decelerates instead
 * of running out of road.
 */
const MEDIAN_SECONDS: Record<string, number> = {
  'image:create': 20,
  'image:contextual': 25,
};

/**
 * The likeness modes measure 45s and 82s, and they are deliberately absent.
 * OmniChatGenerationMode does not include them, so a job in one of those modes
 * cannot reach this view; an entry for it would be a number nothing reads.
 * They are recorded here because they are what the fallback below is sized
 * against.
 */
const UNKNOWN_MODE_MEDIAN_SECONDS = 30;

/** The still a two-phase video renders first is an ordinary image render. */
const VIDEO_STILL_MEDIAN_SECONDS = 25;
/** Animation, which is most of a video job: 487s median for image_to_video. */
const VIDEO_ANIMATION_MEDIAN_SECONDS = 480;

/** The bands the server's own progress field uses, so the two agree. */
const FIRST_PHASE_FLOOR = 5;
const VIDEO_STILL_CEILING = 40;
const FINAL_CEILING = 99;

/**
 * Walks from floor to ceiling, halving what remains every median seconds.
 *
 * Never returns the ceiling. A job is finished when it says it is finished, and
 * a bar that sits on 100 while the work continues is the same lie as one that
 * sits on 90.
 */
function approach(elapsedSeconds: number, medianSeconds: number, floor: number, ceiling: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return floor;
  const span = ceiling - floor;
  const travelled = span * (1 - Math.pow(0.5, elapsedSeconds / Math.max(medianSeconds, 1)));
  return Math.min(floor + travelled, ceiling - 1);
}

function elapsedSeconds(job: OmniChatGenerationJob, now: number) {
  const started = new Date(job.started_at ?? job.created_at).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, (now - started) / 1000);
}

/**
 * The percentage to show for a job, 0 to 100.
 *
 * Only a job that has actually succeeded reports 100.
 */
export function mediaJobPercent(job: OmniChatGenerationJob, now: number): number {
  if (job.status === 'succeeded') return 100;
  if (job.status === 'queued') return FIRST_PHASE_FLOOR;

  const seconds = elapsedSeconds(job, now);

  if (job.kind !== 'video') {
    const median = MEDIAN_SECONDS[`image:${job.mode}`] ?? UNKNOWN_MODE_MEDIAN_SECONDS;
    return Math.floor(approach(seconds, median, FIRST_PHASE_FLOOR, FINAL_CEILING));
  }

  // source_asset_id is written when the still is stored, so it is the exact
  // moment the first phase ends -- a real signal rather than a timer.
  if (!job.source_asset_id) {
    return Math.floor(
      approach(seconds, VIDEO_STILL_MEDIAN_SECONDS, FIRST_PHASE_FLOOR, VIDEO_STILL_CEILING)
    );
  }
  return Math.floor(
    approach(seconds, VIDEO_ANIMATION_MEDIAN_SECONDS, VIDEO_STILL_CEILING, FINAL_CEILING)
  );
}
