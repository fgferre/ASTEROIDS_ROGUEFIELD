import {
  MAGNETISM_RADIUS,
  MAGNETISM_FORCE,
  ENHANCED_SHIP_MAGNETISM_FORCE,
  ORB_MAGNETISM_RADIUS,
  ORB_MAGNETISM_FORCE,
  MIN_ORB_DISTANCE,
  CLUSTER_FUSION_COUNT,
  XP_ORB_MAX_PER_CLASS,
  XP_ORB_BASE_VALUE,
  XP_ORB_MAGNETISM_BOOST,
  XP_ORB_COLLECTION_RADIUS_PADDING,
  XP_ORB_FUSION_CHECK_INTERVAL,
  XP_ORB_FUSION_ANIMATION_DURATION,
  XP_ORB_OFFSCREEN_MARGIN,
  XP_ORB_OFFSCREEN_RETURN_DURATION,
  XP_ORB_CLUSTER_CONFIG,
} from '../../data/constants/gameplay.js';

/**
 * The XP orb numbers the field, fusion, spacing and magnet all read: limits,
 * pull strength, cluster radii and fusion timing. One object, shared by
 * reference, so an upgrade to the pull is seen by every module at once.
 */
export class OrbTuning {
  constructor() {
    this.maxOrbsPerClass = Number.isFinite(XP_ORB_MAX_PER_CLASS)
      ? XP_ORB_MAX_PER_CLASS
      : 100;
    this.baseOrbValue = Number.isFinite(XP_ORB_BASE_VALUE)
      ? XP_ORB_BASE_VALUE
      : 5;

    this.orbOffscreenMargin = Number.isFinite(XP_ORB_OFFSCREEN_MARGIN)
      ? Math.max(0, XP_ORB_OFFSCREEN_MARGIN)
      : 0;
    this.orbOffscreenReturnDuration = Number.isFinite(
      XP_ORB_OFFSCREEN_RETURN_DURATION
    )
      ? Math.max(0.05, XP_ORB_OFFSCREEN_RETURN_DURATION)
      : 0.55;
    this.orbMagnetismRadius = MAGNETISM_RADIUS;
    this.magnetismForce = ENHANCED_SHIP_MAGNETISM_FORCE || MAGNETISM_FORCE;
    this.magnetismBoost = Number.isFinite(XP_ORB_MAGNETISM_BOOST)
      ? XP_ORB_MAGNETISM_BOOST
      : 2.2;
    this.minOrbDistance = MIN_ORB_DISTANCE;
    this.clusterFusionCount = CLUSTER_FUSION_COUNT;
    this.clusterConfig =
      typeof XP_ORB_CLUSTER_CONFIG === 'object' ? XP_ORB_CLUSTER_CONFIG : {};
    this.collectionRadiusPadding = Number.isFinite(
      XP_ORB_COLLECTION_RADIUS_PADDING
    )
      ? XP_ORB_COLLECTION_RADIUS_PADDING
      : 0.1;

    this.fusionCheckInterval =
      Number.isFinite(XP_ORB_FUSION_CHECK_INTERVAL) &&
      XP_ORB_FUSION_CHECK_INTERVAL > 0
        ? XP_ORB_FUSION_CHECK_INTERVAL
        : 0.3;

    this.orbClusterRadius = 0;
    this.orbClusterForce = 0;
    this.fusionDetectionRadius = 0;
    this.fusionDetectionRadiusSq = 0;
    this.fusionAnimationDuration =
      Number.isFinite(XP_ORB_FUSION_ANIMATION_DURATION) &&
      XP_ORB_FUSION_ANIMATION_DURATION > 0
        ? XP_ORB_FUSION_ANIMATION_DURATION
        : 0.82;

    this.configureOrbClustering();
  }

  configureOrbClustering() {
    const baseRadius = ORB_MAGNETISM_RADIUS || 35;
    const baseForce = ORB_MAGNETISM_FORCE || 150;

    const radiusMultiplier = Number.isFinite(
      this.clusterConfig.radiusMultiplier
    )
      ? this.clusterConfig.radiusMultiplier
      : 1.55;
    const minRadius = Number.isFinite(this.clusterConfig.minRadius)
      ? this.clusterConfig.minRadius
      : 52;
    const forceMultiplier = Number.isFinite(this.clusterConfig.forceMultiplier)
      ? this.clusterConfig.forceMultiplier
      : 2.4;

    this.orbClusterRadius = Math.max(baseRadius * radiusMultiplier, minRadius);
    this.orbClusterForce = baseForce * forceMultiplier;

    this.refreshFusionParameters();
  }

  refreshFusionParameters() {
    const detectionFactor = Number.isFinite(
      this.clusterConfig.detectionRadiusFactor
    )
      ? this.clusterConfig.detectionRadiusFactor
      : 0.85;
    const detectionMinRadius = Number.isFinite(
      this.clusterConfig.detectionMinRadius
    )
      ? this.clusterConfig.detectionMinRadius
      : 48;

    this.fusionDetectionRadius = Math.max(
      this.orbClusterRadius * detectionFactor,
      detectionMinRadius
    );
    this.fusionDetectionRadiusSq =
      this.fusionDetectionRadius * this.fusionDetectionRadius;
    const baseDuration =
      Number.isFinite(XP_ORB_FUSION_ANIMATION_DURATION) &&
      XP_ORB_FUSION_ANIMATION_DURATION > 0
        ? XP_ORB_FUSION_ANIMATION_DURATION
        : this.fusionAnimationDuration;
    this.fusionAnimationDuration = baseDuration;
  }

  /** The pull before any upgrade (a run's start, a Retry's re-apply). */
  resetMagnetism() {
    this.orbMagnetismRadius = MAGNETISM_RADIUS;
    this.magnetismForce = ENHANCED_SHIP_MAGNETISM_FORCE || MAGNETISM_FORCE;
  }

  reset() {
    this.resetMagnetism();
    this.minOrbDistance = MIN_ORB_DISTANCE;
    this.clusterFusionCount = CLUSTER_FUSION_COUNT;
    this.configureOrbClustering();
  }
}
