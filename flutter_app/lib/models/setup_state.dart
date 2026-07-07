enum SetupStep {
  checkingStatus,
  downloadingRootfs,
  extractingRootfs,
  installingNode,
  configuringEnvironment,
  cloningNastech,
  installingNastech,
  verifyingNastech,
  configuringBypass,
  complete,
  error,
}

class SetupState {
  final SetupStep step;
  final double progress;
  final String message;
  final String? error;

  const SetupState({
    this.step = SetupStep.checkingStatus,
    this.progress = 0.0,
    this.message = '',
    this.error,
  });

  SetupState copyWith({
    SetupStep? step,
    double? progress,
    String? message,
    String? error,
  }) {
    return SetupState(
      step: step ?? this.step,
      progress: progress ?? this.progress,
      message: message ?? this.message,
      error: error,
    );
  }

  bool get isComplete => step == SetupStep.complete;
  bool get hasError => step == SetupStep.error;

  String get stepLabel {
    switch (step) {
      case SetupStep.checkingStatus:
        return 'Checking status...';
      case SetupStep.downloadingRootfs:
        return 'Downloading Ubuntu rootfs';
      case SetupStep.extractingRootfs:
        return 'Extracting rootfs';
      case SetupStep.installingNode:
        return 'Install Node.js';
      case SetupStep.configuringEnvironment:
        return 'Configure environment';
      case SetupStep.cloningNastech:
        return 'Download nastech-agent';
      case SetupStep.installingNastech:
        return 'Install nastech-agent';
      case SetupStep.verifyingNastech:
        return 'Verify installation';
      case SetupStep.configuringBypass:
        return 'Configure Bionic Bypass';
      case SetupStep.complete:
        return 'Setup complete';
      case SetupStep.error:
        return 'Error';
    }
  }

  int get stepNumber {
    switch (step) {
      case SetupStep.checkingStatus:
        return 0;
      case SetupStep.downloadingRootfs:
        return 1;
      case SetupStep.extractingRootfs:
        return 2;
      case SetupStep.installingNode:
        return 3;
      case SetupStep.configuringEnvironment:
        return 4;
      case SetupStep.cloningNastech:
        return 5;
      case SetupStep.installingNastech:
        return 6;
      case SetupStep.verifyingNastech:
        return 7;
      case SetupStep.configuringBypass:
        return 8;
      case SetupStep.complete:
        return 9;
      case SetupStep.error:
        return -1;
    }
  }

  static const int totalSteps = 9;
}
