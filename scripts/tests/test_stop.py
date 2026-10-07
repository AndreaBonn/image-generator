from stop_support import (
    REPO,
    make_kill_recorder,
    make_notify_recorder,
    make_pgrep,
    make_process_exists,
    stop_mod,
)

# =====================================================================
# windows_kill_command: built from platform_support.stop_strategy
# =====================================================================


def test_windows_kill_command_graceful_has_no_force_flag():
    assert stop_mod.windows_kill_command(4242, force=False) == [
        "taskkill",
        "/PID",
        "4242",
        "/T",
    ]


def test_windows_kill_command_force_appends_f_flag():
    assert stop_mod.windows_kill_command(4242, force=True) == [
        "taskkill",
        "/PID",
        "4242",
        "/T",
        "/F",
    ]


# =====================================================================
# stop_pids: graceful to every pid, one shared wait, force only survivors
# =====================================================================


def test_stop_pids_on_windows_runs_graceful_then_force_taskkill():
    run_commands = []
    alive = {4242}  # process never exits on its own in this test

    def run_command(argv):
        run_commands.append(list(argv))

    stop_mod.stop_pids(
        [4242],
        os_name="windows",
        process_exists=make_process_exists(alive),
        send_signal=lambda pid, sig: (_ for _ in ()).throw(
            AssertionError("windows must not use POSIX signals")
        ),
        run_command=run_command,
        sleep=lambda s: None,
        timeout_s=0,  # times out immediately -> forces escalation
    )

    assert run_commands == [
        ["taskkill", "/PID", "4242", "/T"],
        ["taskkill", "/PID", "4242", "/T", "/F"],
    ]


def test_stop_pids_on_posix_sends_sigterm_then_sigkill():
    kill, sent = make_kill_recorder()
    alive = {55}

    stop_mod.stop_pids(
        [55],
        os_name="linux",
        process_exists=make_process_exists(alive),
        send_signal=kill,
        run_command=lambda argv: (_ for _ in ()).throw(
            AssertionError("posix must not call taskkill")
        ),
        sleep=lambda s: None,
        timeout_s=0,
    )

    assert sent == [(55, "SIGTERM"), (55, "SIGKILL")]


def test_stop_pids_skips_force_once_graceful_succeeds():
    kill, sent = make_kill_recorder()

    stop_mod.stop_pids(
        [55],
        os_name="linux",
        process_exists=lambda pid: False,  # already gone by the time we check
        send_signal=kill,
        run_command=lambda argv: (_ for _ in ()).throw(
            AssertionError("posix must not call taskkill")
        ),
        sleep=lambda s: None,
        timeout_s=30,
    )

    assert sent == [(55, "SIGTERM")]


def test_stop_pids_sends_graceful_to_all_before_forcing_any_survivor():
    """T0xx LOW finding: stop.sh signals every pid at once and shares one
    wait, instead of exhausting `timeout_s` on the first pid before even
    trying the second."""
    kill, sent = make_kill_recorder()
    alive = {11, 22}  # neither dies on its own: both need the force signal

    stop_mod.stop_pids(
        [11, 22],
        os_name="linux",
        process_exists=make_process_exists(alive),
        send_signal=kill,
        run_command=lambda argv: (_ for _ in ()).throw(
            AssertionError("posix must not call taskkill")
        ),
        sleep=lambda s: None,
        timeout_s=0,
    )

    assert sent[:2] == [(11, "SIGTERM"), (22, "SIGTERM")]  # graceful to both first
    assert sorted(sent[2:]) == [(11, "SIGKILL"), (22, "SIGKILL")]  # force only after


# =====================================================================
# stop(): dispatcher chooses run-state vs pgrep fallback vs windows no-op
# =====================================================================


def test_stop_uses_run_state_when_file_present(tmp_path):
    notify_send, messages = make_notify_recorder()

    code = stop_mod.stop(
        tmp_path,
        os_name="linux",
        read_run_state=lambda repo_root: stop_mod.RunState(engine_pid=None, backend_pid=None),
        process_exists=lambda pid: True,
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]


def test_stop_falls_back_to_pgrep_on_posix_when_file_missing():
    notify_send, messages = make_notify_recorder()

    code = stop_mod.stop(
        REPO,
        os_name="linux",
        read_run_state=lambda repo_root: None,
        pgrep=make_pgrep([[]]),
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]


def test_stop_on_windows_with_no_file_reports_not_running_without_pgrep():
    notify_send, messages = make_notify_recorder()

    def pgrep_must_not_be_called(pattern):
        raise AssertionError("pgrep does not exist on Windows")

    code = stop_mod.stop(
        REPO,
        os_name="windows",
        read_run_state=lambda repo_root: None,
        pgrep=pgrep_must_not_be_called,
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]
