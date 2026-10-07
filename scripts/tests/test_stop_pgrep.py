import re
from pathlib import Path

from stop_support import REPO, make_clock, make_kill_recorder, make_pgrep, pgrep_fallback

# =====================================================================
# pgrep_fallback module: own_process_pattern / own_pids / wait_until_gone
# =====================================================================


def test_own_process_pattern_is_anchored_and_escapes_the_repo_path():
    pattern = pgrep_fallback.own_process_pattern(Path("/home/u/my.repo (1)"))

    assert pattern.startswith("^(")
    assert re.escape("/home/u/my.repo (1)") in pattern


def test_own_pids_forwards_the_pattern_to_pgrep():
    seen = {}

    def fake_pgrep(pattern):
        seen["pattern"] = pattern
        return [42]

    result = pgrep_fallback.own_pids(REPO, pgrep=fake_pgrep)

    assert result == [42]
    assert seen["pattern"] == pgrep_fallback.own_process_pattern(REPO)


def test_wait_until_gone_true_once_pids_list_empties():
    pgrep = make_pgrep([[111], [111], []])
    sleeps = []

    result = pgrep_fallback.wait_until_gone(
        REPO, pgrep=pgrep, timeout_s=30, sleep=sleeps.append, clock=make_clock()
    )

    assert result is True
    assert len(sleeps) == 2


def test_wait_until_gone_false_when_pids_never_disappear():
    pgrep = make_pgrep([[111]])

    result = pgrep_fallback.wait_until_gone(
        REPO,
        pgrep=pgrep,
        timeout_s=0.5,
        sleep=lambda s: None,
        clock=make_clock(start=0.0, step=1.0),
    )

    assert result is False


# =====================================================================
# stop_via_pgrep (the four branches of stop.sh, called directly)
# =====================================================================


def test_stop_via_pgrep_reports_not_running_and_sends_no_signal():
    kill, sent = make_kill_recorder()
    messages = []

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=make_pgrep([[]]),
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=30,
    )

    assert code == 0
    assert sent == []
    assert messages == ["Non era in esecuzione."]


def test_stop_via_pgrep_sends_sigterm_and_succeeds_once_processes_exit():
    kill, sent = make_kill_recorder()
    messages = []

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=make_pgrep([[111], [111], []]),
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=30,
    )

    assert code == 0
    assert sent == [(111, "SIGTERM")]
    assert messages[-1] == "Chiuso. La memoria della scheda video è libera."


def test_stop_via_pgrep_escalates_to_sigkill_when_sigterm_times_out():
    kill, sent = make_kill_recorder()
    messages = []
    # call#1 initial own_pids; call#2 wait_until_gone's check (timeout_s=0 -> times
    # out immediately); call#3 post-escalation own_pids; call#4 final check.
    pgrep = make_pgrep([[111], [111], [111], []])

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=pgrep,
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=0,
    )

    assert code == 0
    assert (111, "SIGTERM") in sent
    assert (111, "SIGKILL") in sent
    assert messages[-1] == "Chiuso. La memoria della scheda video è libera."


def test_stop_via_pgrep_returns_1_when_sigkill_also_fails():
    kill, _sent = make_kill_recorder()
    messages = []
    pgrep = make_pgrep([[111]])  # pids never, ever disappear

    code = pgrep_fallback.stop_via_pgrep(
        REPO,
        pgrep=pgrep,
        kill=kill,
        notify=messages.append,
        sleep=lambda s: None,
        clock=make_clock(),
        timeout_s=0,
    )

    assert code == 1
    assert (
        messages[-1] == "Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer."
    )
