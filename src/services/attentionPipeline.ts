import { ModelInferenceEngine, InferenceOutput } from '../ml/inference';
import { LandmarkPoint } from '../ml/types';

export type PipelineInferenceResult = InferenceOutput;
export type Landmark3D = LandmarkPoint;

export class AttentionPipeline {
  private engine: ModelInferenceEngine;

  constructor() {
    this.engine = new ModelInferenceEngine();
  }

  public addFrame(
    faceDetected: boolean,
    rawLandmarks: LandmarkPoint[] | null,
    isSimulation = false
  ): PipelineInferenceResult {
    const now = Date.now();
    return this.engine.processFrame(now, faceDetected, rawLandmarks, isSimulation);
  }

  public reset(): void {
    this.engine.reset();
  }
}
