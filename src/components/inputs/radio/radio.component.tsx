import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormGroup, RadioButtonGroup, RadioButton } from '@carbon/react';
import { type FormFieldProps } from '../../../types';
import { useField } from 'formik';
import { FormContext } from '../../../form-context';
import { isTrue } from '../../../utils/boolean-utils';
import { isInlineView } from '../../../utils/form-helper';
import { isEmpty } from '../../../validators/form-validator';
import FieldValueView from '../../value/view/field-value-view.component';
import RequiredFieldLabel from '../../required-field-label/required-field-label.component';
import styles from './radio.scss';
import { useFieldValidationResults } from '../../../hooks/useFieldValidationResults';

const Radio: React.FC<FormFieldProps> = ({ question, onChange, handler, previousValue }) => {
  const [field, meta] = useField(question.id);
  const { setFieldValue, encounterContext, layoutType, workspaceLayout } = React.useContext(FormContext);
  const { t } = useTranslation();
  const { errors, warnings, setErrors, setWarnings } = useFieldValidationResults(question);
  const [selectedValue, setSelectedValue] = useState(field.value);

  const handleChange = (value) => {
    const newValue = selectedValue === value ? null : value;
    setSelectedValue(newValue);
    setFieldValue(question.id, newValue);
    onChange(question.id, newValue, setErrors, setWarnings);
    handler?.handleFieldSubmission(question, newValue, encounterContext);
  };

  useEffect(() => {
    if (!isEmpty(previousValue)) {
      setFieldValue(question.id, previousValue);
      onChange(question.id, previousValue, setErrors, setWarnings);
      handler?.handleFieldSubmission(question, previousValue, encounterContext);
    }
  }, [previousValue]);

  const isInline = useMemo(() => {
    if (['view', 'embedded-view'].includes(encounterContext.sessionMode) || isTrue(question.readonly)) {
      return isInlineView(question.inlineRendering, layoutType, workspaceLayout, encounterContext.sessionMode);
    }
    return false;
  }, [encounterContext.sessionMode, question.readonly, question.inlineRendering, layoutType, workspaceLayout]);

  return encounterContext.sessionMode == 'view' ||
    encounterContext.sessionMode == 'embedded-view' ||
    isTrue(question.readonly) ? (
    <FieldValueView
      label={t(question.label)}
      value={field.value ? handler?.getDisplayValue(question, field.value) : field.value}
      conceptName={question.meta?.concept?.display}
      isInline={isInline}
    />
  ) : (
    !question.isHidden && (
      <FormGroup
        legendText={
          question.isRequired ? <RequiredFieldLabel label={t(question.label)} /> : <span>{t(question.label)}</span>
        }
        className={styles.boldedLegend}
        disabled={question.isDisabled}
        invalid={errors.length > 0}>
          <p>Test</p>
        <RadioButtonGroup
          name={question.id}
          valueSelected={field.value}
          onChange={handleChange}
          orientation={question.questionOptions?.orientation || "vertical"}>
          {question.questionOptions.answers
            .filter((answer) => !answer.isHidden)
            .map((answer, index) => {
              return (
                <RadioButton
                  id={`${question.id}-${answer.label}`}
                  labelText={answer.label ?? ''}
                  value={answer.concept}
                  key={index}
                  onClick={() => handleChange(answer.concept)}
                />
              );
            })}
        </RadioButtonGroup>
        {(errors?.length > 0 || warnings?.length > 0) && (
          <div>
            <div className={styles.errorMessage}>
              {errors.length > 0 ? errors[0].message : warnings.length > 0 ? warnings[0].message : null}
            </div>
          </div>
        )}
      </FormGroup>
    )
  );
};

export default Radio;
