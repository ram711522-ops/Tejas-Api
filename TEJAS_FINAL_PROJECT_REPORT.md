# TEJAS
# Solar Power Generation Prediction and Performance Analysis

## Final Project Report

---

## Abstract

Solar energy is an important renewable energy source, but solar power generation varies depending on environmental conditions, irradiation, temperature, and time of day. Accurate solar power prediction can help understand generation behavior, evaluate prediction performance, and support solar plant monitoring.

The TEJAS project focuses on solar power generation prediction using machine learning techniques and environmental and time-related features. This experimental study uses historical solar power generation data from two solar plants and investigates the relationship between environmental variables and AC power generation.

The experiments primarily evaluated a Random Forest Regressor using ambient temperature, module temperature, irradiation, and time-based features. The study included feature importance analysis, permutation importance, feature ablation, plant-wise comparison, daytime and nighttime evaluation, alternative weather-data investigation, and residual analysis.

The final five-feature configuration consisted of ambient temperature, module temperature, hour sine, hour cosine, and irradiation. Irradiation was identified as the most influential feature. The experimental results showed that Plant 1 achieved an overall R² of 0.9958, while Plant 2 achieved an overall R² of 0.8971. Plant 2 demonstrated substantially weaker daytime prediction performance compared with Plant 1, while nighttime/low-irradiance predictions were excellent for both plants.

The study also identified increasing prediction-error variability at higher power levels. These experiments provide insights into model behavior, feature contributions, plant-specific performance, and areas requiring further validation.

---

## 1. Introduction

Renewable energy sources are becoming increasingly important for meeting energy demands while reducing dependence on conventional energy sources. Solar energy is one of the most widely adopted renewable energy technologies because sunlight can be converted into electrical energy using photovoltaic systems.

However, solar power generation is not constant. It changes depending on irradiation, environmental temperature, module temperature, atmospheric conditions, and the time of day. These variations make solar power prediction an important problem in renewable energy analysis.

Machine learning techniques can learn relationships between historical environmental conditions and power generation. By analyzing historical data, machine learning models can estimate solar power output under different conditions.

The TEJAS project investigates solar power prediction using historical generation and weather-related data. The experimental study focuses on evaluating prediction performance, understanding feature contributions, comparing two solar plants, and analyzing the limitations of the selected model.

---

## 2. Problem Statement

Solar power generation varies continuously with environmental and time-related conditions. Accurate prediction of AC power generation is challenging because environmental variables interact with each other and because generation behavior differs across plants and operating conditions.

The problem addressed by this project is:

**To develop and evaluate a machine learning model capable of predicting solar plant AC power generation using environmental and time-related features, while analyzing its performance across different solar plants and generation conditions.**

The study also investigates:

- Which features contribute most to prediction accuracy?
- How does model performance differ between solar plants?
- Is daytime prediction more difficult than nighttime prediction?
- Does removing individual features affect performance?
- Can alternative weather data improve prediction?
- What patterns can be identified from prediction errors?

---

## 3. Project Objectives

The objectives of the TEJAS experimental study are:

1. Develop machine learning models for solar power generation prediction.
2. Analyze historical solar generation data.
3. Investigate the relationship between environmental features and AC power.
4. Identify the most important predictive features.
5. Compare prediction performance between two solar plants.
6. Evaluate performance during daytime and nighttime/low-irradiance conditions.
7. Perform feature ablation studies.
8. Investigate alternative weather-data sources.
9. Analyze prediction errors using residual analysis.
10. Identify model limitations and potential future improvements.

---

## 4. Dataset Description

### 4.1 Dataset Source

The experimental study primarily used the Solar Power Generation Data dataset obtained from Kaggle.

### 4.2 Dataset Overview

| Parameter | Description |
|---|---|
| Dataset | Solar Power Generation Data |
| Total observations | 6,416 |
| Plant 1 observations | 3,157 |
| Plant 2 observations | 3,259 |
| Plant 1 ID | 4135001 |
| Plant 2 ID | 4136001 |
| Data period | May 15 – June 17, 2020 |
| Sampling interval | Approximately 15 minutes |
| Target variable | AC_POWER |

The dataset contains observations from two solar plants, making it possible to evaluate plant-specific performance and compare the behavior of the model across different generation systems.

### 4.3 Plant Information

The experimental dataset includes:

- Plant 1 — Plant ID 4135001
- Plant 2 — Plant ID 4136001

The model was evaluated separately for each plant.

### 4.4 Dataset Features

The processed dataset contains the following columns:

| Feature | Description |
|---|---|
| DATE_TIME | Observation timestamp |
| PLANT_ID | Solar plant identifier |
| AC_POWER | AC power generation |
| AMBIENT_TEMPERATURE | Environmental temperature |
| MODULE_TEMPERATURE | Solar module temperature |
| IRRADIATION | Irradiation measurement |
| hour_sin | Sine transformation of time of day |
| hour_cos | Cosine transformation of time of day |

---

## 5. Data Preparation

Data preparation was performed before model training and experimentation.

### 5.1 Plant Selection

The observations were filtered separately for each plant using the plant identifier.

### 5.2 Chronological Sorting

Data was sorted using the timestamp to preserve temporal order.

### 5.3 Time-Based Feature Engineering

The hour of the day was represented using sine and cosine transformations.

These features represent cyclical time behavior. This is useful because the end of a day and the beginning of the next day are close in time, even though their numerical hour values appear far apart.

### 5.4 Feature Selection

The experimental model used five features:

- Ambient temperature
- Module temperature
- Hour sine
- Hour cosine
- Irradiation

### 5.5 Train-Test Split

The data was divided into training and testing subsets using a chronological 80/20 split.

The earlier 80% of observations were used for training, and the later 20% were used for testing.

This approach preserves temporal order and avoids randomly mixing future observations into the training data.

---

## 6. Machine Learning Methodology

### 6.1 Random Forest Regressor

Random Forest Regression was used as the primary model for the later experimental investigations.

Random Forest is an ensemble learning method that combines predictions from multiple decision trees.

Each tree learns relationships between input features and the target variable. The final prediction is obtained by combining the predictions of the individual trees.

### 6.2 Model Configuration

| Parameter | Configuration |
|---|---|
| Model | Random Forest Regressor |
| Number of estimators | 100 |
| Random state | 42 |
| Parallel jobs | 1 |
| Training split | 80% |
| Testing split | 20% |
| Split type | Chronological |

### 6.3 Input Features

The model inputs were:

- AMBIENT_TEMPERATURE
- MODULE_TEMPERATURE
- hour_sin
- hour_cos
- IRRADIATION

### 6.4 Target Variable

The target variable was:

`AC_POWER`

The model estimates AC power generation from the selected environmental and time-related features.

---

## 7. Evaluation Metrics

Three metrics were used to evaluate model performance.

### 7.1 Mean Absolute Error (MAE)

MAE measures the average absolute difference between actual and predicted values.

\[
MAE=\frac{1}{n}\sum_{i=1}^{n}|y_i-\hat{y}_i|
\]

A lower MAE indicates better prediction accuracy.

### 7.2 Root Mean Squared Error (RMSE)

RMSE measures the square root of the average squared prediction error.

\[
RMSE=\sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i-\hat{y}_i)^2}
\]

RMSE penalizes larger prediction errors more heavily than MAE.

### 7.3 R² Score

R² measures the proportion of variation in the target variable explained by the model.

\[
R^2=1-\frac{\sum(y_i-\hat{y}_i)^2}{\sum(y_i-\bar{y})^2}
\]

A higher R² generally indicates that the model explains more of the variation in the target data.

---

## 8. Experimental Investigation

The experimental study was conducted progressively to understand the model's behavior, feature contribution, plant-specific performance, and limitations.

### 8.1 Early Experiments: Baseline and Weather Data Investigation

The initial experimental phase investigated baseline prediction performance and explored alternative weather-data configurations.

The investigation included:

- Baseline Random Forest evaluation.
- Comparison of original Kaggle weather features.
- Investigation of NASA-derived radiation data.
- Comparison of weather feature distributions.
- Examination of irradiation differences.
- Radiation scaling experiments.
- Time-alignment experiments.
- Calibration approaches.
- Testing alternative weather inputs.

#### Findings

The original Kaggle irradiation feature performed better than the tested NASA radiation substitutions in the evaluated configurations.

NASA radiation data showed distribution differences compared with the original irradiation feature.

Simple scaling and time-offset adjustments did not adequately resolve the mismatch.

NASA-only weather-feature models performed worse than models using the original Kaggle weather features.

Adding NASA radiation as an additional feature did not provide a meaningful improvement in the tested configurations.

NASA ambient temperature performed similarly to the original ambient-temperature feature in the tested comparison.

These results were exploratory and do not establish that NASA weather data is universally inferior. Further validation of units, timestamps, spatial resolution, and data correspondence would be required.

---

## 9. Feature Importance Analysis

### 9.1 Objective

The purpose of feature importance analysis was to identify which input variables contributed most strongly to the model's prediction behavior.

### 9.2 Method

Random Forest impurity-based feature importance was examined.

### 9.3 Findings

The analysis showed that:

- Irradiation was overwhelmingly the most important feature.
- Time-related features had comparatively smaller contributions.
- Temperature features had smaller contributions than irradiation.

The reported irradiation importance was approximately 0.9966 in the feature-importance experiment.

### 9.4 Conclusion

Irradiation was identified as the dominant predictive feature.

Feature importance represents the model's use of information and should not be interpreted as proof of causal relationships.

---

## 10. Permutation Importance Analysis

### 10.1 Objective

Permutation importance was used to investigate how prediction performance changed when the information contained in individual features was disrupted.

### 10.2 Method

The feature values were randomly permuted, and the increase in MAE was measured.

### 10.3 Results

Baseline test MAE:

234.0495

| Feature | Increase in MAE |
|---|---:|
| IRRADIATION | 7930.067 ± 194.943 |
| hour_sin | 34.9845 ± 7.2282 |
| hour_cos | 27.2826 ± 2.9722 |
| MODULE_TEMPERATURE | 14.9069 ± 2.5139 |
| AMBIENT_TEMPERATURE | -6.2243 ± 1.882 |

### 10.4 Interpretation

Irradiation had the strongest predictive contribution.

Time-related features contributed useful information.

Module temperature contributed positively to prediction performance.

Ambient temperature had a slightly negative permutation-importance value in the specific evaluation, suggesting that disrupting it slightly improved MAE in that test.

This result does not mean ambient temperature should always be removed. Its contribution was later found to differ between plants.

---

## 11. Feature Ablation Study

### 11.1 Objective

The feature ablation study investigated the impact of removing individual features or groups of features from the model.

### 11.2 Plant

Plant 1 — 4135001

### 11.3 Results

| Configuration | MAE | RMSE | R² |
|---|---:|---:|---:|
| Baseline — all features | 235.8340 | 516.1849 | 0.9958 |
| Without Ambient Temperature | 236.2746 | 519.5649 | 0.9957 |
| Without Module Temperature | 251.1644 | 546.7376 | 0.9953 |
| Without Both Temperatures | 272.0337 | 575.6489 | 0.9948 |
| Without Time Features | 292.7780 | 589.3389 | 0.9945 |

### 11.4 Discussion

Removing ambient temperature produced only a small change in performance.

Removing module temperature caused a larger increase in prediction error.

Removing both temperature features further worsened performance.

Removing time features also increased prediction error.

### 11.5 Conclusion

For Plant 1, module temperature and time features contributed more noticeably than ambient temperature in the tested configuration.

Ambient temperature appeared nearly redundant for Plant 1 in this particular experiment.

---

## 12. Daytime and Nighttime Ambient Temperature Analysis

### 12.1 Objective

This experiment investigated whether ambient temperature contributed differently under daytime and nighttime/low-irradiance conditions.

### 12.2 Plant

Plant 1 — 4135001

### 12.3 Results

| Condition | Samples | Baseline MAE | Baseline RMSE | Baseline R² | Without Ambient MAE | Without Ambient RMSE | Without Ambient R² |
|---|---:|---:|---:|---:|---:|---:|
| Overall | 632 | 235.8340 | 516.1849 | 0.9958 | 236.2746 | 519.5649 | 0.9957 |
| Daytime | 303 | 484.8134 | 744.5660 | 0.9877 | 485.6873 | 749.4590 | 0.9875 |
| Nighttime/Low | 329 | 6.5308 | 35.6320 | 0.9824 | 6.5724 | 35.5256 | 0.9825 |

### 12.4 Discussion

The removal of ambient temperature resulted in very small changes across all conditions.

The overall MAE increased by approximately 0.44.

The daytime MAE increased by approximately 0.87.

The nighttime/low-irradiance MAE increased by approximately 0.04.

### 12.5 Conclusion

Ambient temperature had a negligible contribution to Plant 1 performance in the tested configuration.

The results were specific to Plant 1 and should not be generalized to all solar plants.

---

## 13. Plant 2 Ambient Temperature Validation

### 13.1 Objective

The experiment validated the ambient-temperature ablation findings on Plant 2.

### 13.2 Plant

Plant 2 — 4136001

### 13.3 Results

| Condition | Samples | Baseline MAE | Baseline RMSE | Baseline R² | Without Ambient MAE | Without Ambient RMSE | Without Ambient R² |
|---|---:|---:|---:|---:|---:|---:|
| Overall | 652 | 717.3942 | 1769.5568 | 0.8971 | 726.5738 | 1841.7550 | 0.8885 |
| Daytime | 317 | 1467.1757 | 2537.6031 | 0.6854 | 1485.7194 | 2641.1424 | 0.6592 |
| Nighttime/Low | 335 | 7.8994 | 31.3326 | 0.9882 | 8.2181 | 32.2491 | 0.9875 |

### 13.4 Discussion

Removing ambient temperature worsened performance across all three conditions.

The deterioration was more noticeable during daytime.

### 13.5 Conclusion

Ambient temperature has plant-dependent predictive value.

It was nearly redundant for Plant 1 but useful for Plant 2.

Therefore, ambient temperature was retained in the shared five-feature model.

---

## 14. Cross-Plant Performance Comparison

### 14.1 Objective

The objective was to compare the same model configuration across both plants.

### 14.2 Results

| Plant | Condition | Samples | MAE | RMSE | R² |
|---|---|---:|---:|---:|---:|
| Plant 1 | Overall | 632 | 235.8340 | 516.1849 | 0.9958 |
| Plant 1 | Daytime | 303 | 484.8134 | 744.5660 | 0.9877 |
| Plant 1 | Nighttime/Low | 329 | 6.5308 | 35.6320 | 0.9824 |
| Plant 2 | Overall | 652 | 717.3942 | 1769.5568 | 0.8971 |
| Plant 2 | Daytime | 317 | 1467.1757 | 2537.6031 | 0.6854 |
| Plant 2 | Nighttime/Low | 335 | 7.8994 | 31.3326 | 0.9882 |

### 14.3 Discussion

Plant 1 achieved substantially better overall performance than Plant 2.

The largest difference occurred during daytime generation.

Plant 2 had significantly larger daytime prediction errors.

Both plants achieved excellent nighttime/low-irradiance prediction performance.

### 14.4 Conclusion

The same model configuration did not perform equally across both plants.

The results suggest that Plant 2's daytime generation behavior is more difficult to predict using the current features and model configuration.

The experiments do not establish the exact physical or operational reason for this difference.

---

## 15. Actual vs Predicted Analysis

### 15.1 Objective

The actual-versus-predicted analysis was conducted to visually evaluate prediction accuracy.

### 15.2 Method

The model's predicted AC power values were plotted against the actual AC power values.

An ideal prediction would lie on the diagonal line where predicted values equal actual values.

### 15.3 Observations

- Most points were close to the ideal diagonal.
- Predictions generally followed actual power values.
- The spread of points increased at higher power levels.
- High-generation predictions showed more noticeable errors.

### 15.4 Conclusion

The model demonstrated strong overall prediction accuracy.

However, prediction consistency decreased at higher power levels.

---

## 16. Residual Analysis

### 16.1 Residual Definition

Residuals were calculated as:

\[
Residual=Actual\ AC\ Power-Predicted\ AC\ Power
\]

Positive residuals indicate underprediction.

Negative residuals indicate overprediction.

Residuals close to zero indicate accurate predictions.

### 16.2 Residual Distribution

The residual histogram showed:

- Most residuals concentrated around zero.
- Tails on both sides of the distribution.
- Some large positive and negative errors.
- A somewhat asymmetric distribution.

### 16.3 Residual vs Predicted Power

The residual-versus-predicted graph showed:

- A relatively tight residual distribution at low predicted power.
- Increasing residual spread as predicted power increased.
- Larger prediction errors at high power levels.
- Errors occurring on both sides of the zero-residual line.

### 16.4 Interpretation

The increasing residual spread suggests that prediction-error variance was not constant across the prediction range.

This behavior is commonly described as heteroscedasticity.

The model was generally more consistent at low generation levels and less consistent at higher generation levels.

### 16.5 Conclusion

Residual analysis identified a limitation that was not fully represented by the overall R² score.

Although the model performed strongly overall, prediction errors became more variable at higher generation levels.

---

## 17. Final Model Evaluation

### 17.1 Objective

The final evaluation consolidated model performance across both plants and generation conditions.

### 17.2 Final Results

| Plant | Condition | Samples | MAE | RMSE | R² |
|---|---|---:|---:|---:|---:|
| Plant 1 | Overall | 632 | 235.8340 | 516.1849 | 0.9958 |
| Plant 1 | Daytime | 303 | 484.8134 | 744.5660 | 0.9877 |
| Plant 1 | Nighttime/Low | 329 | 6.5308 | 35.6320 | 0.9824 |
| Plant 2 | Overall | 652 | 717.3942 | 1769.5568 | 0.8971 |
| Plant 2 | Daytime | 317 | 1467.1757 | 2537.6031 | 0.6854 |
| Plant 2 | Nighttime/Low | 335 | 7.8994 | 31.3326 | 0.9882 |

### 17.3 Final Evaluation Findings

- Plant 1 achieved excellent overall performance.
- Plant 2 achieved good overall performance but had weaker daytime prediction.
- Daytime prediction was more challenging than nighttime/low-irradiance prediction.
- Nighttime/low-irradiance predictions were excellent for both plants.
- Prediction errors were more variable at higher power levels.
- The results reproduced the cross-plant performance observed in Experiment 18.

---

## 18. Final Feature Selection

Based on feature importance, permutation importance, feature ablation, and plant-wise validation, the following features were retained.

| Feature | Decision | Reason |
|---|---|---|
| IRRADIATION | Retain | Dominant predictive feature |
| MODULE_TEMPERATURE | Retain | Removing it worsened performance |
| hour_sin | Retain | Time-related predictive information |
| hour_cos | Retain | Time-related predictive information |
| AMBIENT_TEMPERATURE | Retain | Useful for Plant 2 despite limited impact on Plant 1 |

### Final Feature Set

1. AMBIENT_TEMPERATURE
2. MODULE_TEMPERATURE
3. hour_sin
4. hour_cos
5. IRRADIATION

The shared five-feature configuration was retained to support evaluation across both plants.

---

## 19. Final Findings

The experiments established the following findings:

1. Irradiation was the dominant predictive feature.
2. Module temperature provided additional predictive value.
3. Time-related features contributed useful information.
4. Ambient temperature had plant-dependent predictive value.
5. Removing ambient temperature had negligible impact on Plant 1.
6. Removing ambient temperature worsened Plant 2 performance.
7. Plant 1 demonstrated substantially better overall prediction performance than Plant 2.
8. Daytime generation was more challenging than nighttime/low-irradiance generation.
9. Nighttime/low-irradiance predictions were excellent for both plants.
10. Prediction-error variability increased at higher power levels.
11. Some large prediction errors remained.
12. The tested NASA weather-feature configurations did not outperform the original Kaggle weather-feature configurations.
13. The same model configuration did not provide equal performance across both plants.
14. All five features were retained in the final experimental configuration.

---

## 20. Limitations

### Dataset Duration

The dataset covers approximately one month of observations.

The results may not represent performance across all seasons or long-term plant operating conditions.

### Plant-Specific Performance

The model performed differently across the two plants.

The findings should not be generalized to other solar plants without further validation.

### Daytime Prediction

Plant 2 demonstrated substantially weaker daytime prediction performance.

Further investigation is required to identify the reasons.

### External Weather Data

NASA weather-data investigations were exploratory.

The units, timestamps, spatial resolution, and correspondence with plant observations were not fully validated in every experimental configuration.

Therefore, these findings should not be interpreted as definitive proof that NASA data is universally inferior.

### Model Scope

The later experiments primarily used Random Forest.

Other models may perform differently and would require further evaluation.

### Error Analysis

Residual analysis identified increased error spread at high power levels.

However, the physical or operational causes of the larger errors were not conclusively established.

### Real-World Validation

The experiments used historical data.

Real-time performance, long-term reliability, and operational effectiveness require further validation.

---

## 21. Future Scope

Future work may include:

- Testing longer historical datasets.
- Evaluating performance across different seasons.
- Investigating Plant 2 daytime prediction errors.
- Exploring plant-specific models.
- Evaluating additional machine learning algorithms.
- Investigating feature engineering.
- Improving weather-data quality and alignment.
- Evaluating real-time predictions using actual plant measurements.
- Monitoring prediction performance over time.
- Investigating large prediction errors at high generation levels.
- Conducting additional validation before replacing the existing production model.

---

## 22. Overall Conclusion

The TEJAS experimental study investigated solar power generation prediction using environmental and time-related features.

The experiments demonstrated that irradiation was the dominant predictive feature, while module temperature and time-related features provided additional predictive information.

Ambient temperature showed plant-dependent importance. It had little impact on Plant 1 performance when removed but worsened Plant 2 performance when removed. Therefore, it was retained in the shared five-feature configuration.

Plant 1 achieved an overall R² of 0.9958, while Plant 2 achieved an overall R² of 0.8971.

The largest performance difference occurred during daytime generation. Plant 1 achieved a daytime R² of 0.9877, while Plant 2 achieved a daytime R² of 0.6854.

Both plants demonstrated excellent nighttime/low-irradiance prediction performance.

Residual analysis showed that most errors were concentrated around zero, but prediction-error variability increased at higher power levels.

The tested NASA weather-feature configurations did not improve prediction performance compared with the original Kaggle weather features in the evaluated configurations.

Overall, the experiments provided valuable insights into feature contributions, plant-specific prediction behavior, daytime and nighttime performance, and model limitations. The results support continued evaluation of the five-feature model configuration, while additional validation is necessary before making broader operational claims.

---

## 23. Experimental Completion Status

| Experimental Area | Status |
|---|---|
| Baseline model investigation | Completed |
| Weather-data investigation | Completed |
| NASA feature exploration | Completed |
| Feature importance | Completed |
| Permutation importance | Completed |
| Feature ablation | Completed |
| Plant 1 ambient-temperature validation | Completed |
| Plant 2 ambient-temperature validation | Completed |
| Cross-plant comparison | Completed |
| Actual vs predicted analysis | Completed |
| Residual analysis | Completed |
| Final evaluation | Completed |

**Planned experimental phase: Completed**

The next phase is project documentation, further validation, demonstration preparation, and carefully planned integration into the TEJAS application.

---

# End of Final Project Report