const { getRedisClient } = require('../config/redis');

class DistributedQueue {
  constructor(name) {
    this.name = name;
    this.redis = getRedisClient();
    this.pendingKey = `queue:${name}:pending`;     // Sorted Set (Score = Priority/Timestamp)
    this.jobsKey = `queue:${name}:jobs`;           // Hash (jobId -> job data JSON)
    this.processingKey = `queue:${name}:processing`; // Hash (jobId -> lock timestamp)
    this.dlqKey = `queue:${name}:dlq`;             // List (jobIds of failed jobs)
  }

  /**
   * Adds a new job to the queue
   * @param {string} jobId Unique identifier for the job
   * @param {object} data Job payload
   * @param {number} priority Priority score (lower numbers run first, default: timestamp)
   * @param {number} maxRetries Maximum number of retries before moving to DLQ (default: 3)
   */
  async addJob(jobId, data, priority = null, maxRetries = 3) {
    const score = priority !== null ? priority : Date.now();
    const jobPayload = {
      id: jobId,
      data,
      addedAt: Date.now(),
      attempts: 0,
      maxRetries,
      progress: 0,
      status: 'pending',
      error: null
    };

    await this.redis.multi()
      .hset(this.jobsKey, jobId, JSON.stringify(jobPayload))
      .zadd(this.pendingKey, score, jobId)
      .exec();

    return jobPayload;
  }

  /**
   * Pops a job for processing, marking it as active
   * Uses a Lua script or ZPOPMIN + HSET transaction for atomic lock execution
   */
  async popJob(workerId) {
    // Lua script to atomically fetch the highest priority pending job, 
    // move it to processing, and return its details.
    const luaScript = `
      local pendingJob = redis.call('zpopmin', KEYS[1], 1)
      if #pendingJob == 0 then
        return nil
      end
      local jobId = pendingJob[1]
      redis.call('hset', KEYS[2], jobId, ARGV[1])
      local jobJson = redis.call('hget', KEYS[3], jobId)
      return {jobId, jobJson}
    `;

    try {
      const timestamp = Date.now().toString();
      const result = await this.redis.eval(
        luaScript,
        3,
        this.pendingKey,
        this.processingKey,
        this.jobsKey,
        timestamp
      );

      if (!result) return null;

      const [jobId, jobJson] = result;
      const job = JSON.parse(jobJson);
      job.status = 'processing';
      job.attempts++;
      
      // Update job state in hash
      await this.redis.hset(this.jobsKey, jobId, JSON.stringify(job));
      return job;
    } catch (e) {
      console.error(`[Queue:${this.name}] Error popping job:`, e);
      return null;
    }
  }

  /**
   * Marks a job as completed and cleans up its tracking keys
   */
  async completeJob(jobId, result = null) {
    await this.redis.multi()
      .hdel(this.jobsKey, jobId)
      .hdel(this.processingKey, jobId)
      .exec();
    
    // Store job progress or triggers in pub/sub if progress streaming is active
    this.redis.publish(`progress:${this.name}`, JSON.stringify({ jobId, status: 'completed', result }));
  }

  /**
   * Reports increment progress updates
   */
  async updateProgress(jobId, percentage) {
    const jobJson = await this.redis.hget(this.jobsKey, jobId);
    if (!jobJson) return;

    const job = JSON.parse(jobJson);
    job.progress = percentage;
    await this.redis.hset(this.jobsKey, jobId, JSON.stringify(job));

    this.redis.publish(`progress:${this.name}`, JSON.stringify({ jobId, status: 'processing', progress: percentage }));
  }

  /**
   * Fails a job, scheduling it for retry or routing to Dead-Letter Queue (DLQ)
   */
  async failJob(jobId, errorMessage) {
    const jobJson = await this.redis.hget(this.jobsKey, jobId);
    if (!jobJson) {
      await this.redis.hdel(this.processingKey, jobId);
      return;
    }

    const job = JSON.parse(jobJson);
    job.error = errorMessage;
    job.status = 'failed';

    if (job.attempts < job.maxRetries) {
      // Exponential backoff delay
      const backoffDelay = Math.pow(2, job.attempts) * 1000;
      const nextRunTime = Date.now() + backoffDelay;
      job.status = 'retry';

      await this.redis.multi()
        .hset(this.jobsKey, jobId, JSON.stringify(job))
        .hdel(this.processingKey, jobId)
        // Add back to pending with backoff score
        .zadd(this.pendingKey, nextRunTime, jobId)
        .exec();
      
      console.log(`[Queue:${this.name}] Job ${jobId} failed. Scheduled for retry #${job.attempts} in ${backoffDelay}ms`);
    } else {
      // Route to Dead Letter Queue (DLQ)
      await this.redis.multi()
        .hset(this.jobsKey, jobId, JSON.stringify(job))
        .hdel(this.processingKey, jobId)
        .rpush(this.dlqKey, jobId)
        .exec();
      
      console.error(`[Queue:${this.name}] Job ${jobId} permanently failed. Routed to DLQ: ${errorMessage}`);
      this.redis.publish(`progress:${this.name}`, JSON.stringify({ jobId, status: 'failed', error: errorMessage }));
    }
  }

  /**
   * Recovers stale processing jobs if a worker crashes
   * If a job stays in processing state for too long (> 2 minutes), re-enqueue it.
   */
  async recoverCrashedWorkers(timeoutMs = 120000) {
    const processingJobs = await this.redis.hgetall(this.processingKey);
    const now = Date.now();
    let recoveredCount = 0;

    for (const [jobId, lockTimeStr] of Object.entries(processingJobs)) {
      const lockTime = parseInt(lockTimeStr, 10);
      if (now - lockTime > timeoutMs) {
        console.warn(`[Queue:${this.name}] Stale job detected: ${jobId}. Re-queuing...`);
        // Re-add to pending and remove from processing lock
        await this.redis.multi()
          .zadd(this.pendingKey, now, jobId)
          .hdel(this.processingKey, jobId)
          .exec();
        
        recoveredCount++;
      }
    }
    return recoveredCount;
  }
}

module.exports = DistributedQueue;
