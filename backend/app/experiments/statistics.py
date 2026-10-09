from math import sqrt
from statistics import NormalDist


def wilson_interval(
    events: int,
    trials: int,
    confidence_level: float = 0.95,
) -> tuple[float, float]:
    """Return a two-sided Wilson score interval for a binomial proportion."""

    if trials <= 0:
        raise ValueError("At least one completed trial is required.")
    if not 0 <= events <= trials:
        raise ValueError("The event count must be between zero and the trial count.")
    if not 0 < confidence_level < 1:
        raise ValueError("The confidence level must be between zero and one.")

    estimate = events / trials
    z_value = NormalDist().inv_cdf(0.5 + confidence_level / 2)
    z_squared = z_value * z_value
    denominator = 1 + z_squared / trials
    center = (estimate + z_squared / (2 * trials)) / denominator
    margin = (
        z_value
        * sqrt(estimate * (1 - estimate) / trials + z_squared / (4 * trials * trials))
        / denominator
    )
    return max(0.0, center - margin), min(1.0, center + margin)
