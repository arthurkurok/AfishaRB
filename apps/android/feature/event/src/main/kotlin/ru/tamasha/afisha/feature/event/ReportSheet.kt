package ru.tamasha.afisha.feature.event

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import ru.tamasha.afisha.core.designsystem.illustration.BeeLoader
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.ReportReason

/** «Сообщить о неточности» → `POST /v1/reports`. Комментарий — без ПДн (подсказка). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReportSheet(sending: Boolean, onSend: (ReportReason, String) -> Unit, onDismiss: () -> Unit) {
    var reason by rememberSaveable { mutableStateOf(ReportReason.WrongTime) }
    var comment by rememberSaveable { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.padding(horizontal = Tokens.Space.S4).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2),
        ) {
            Text(stringResource(R.string.report_title), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            Column(Modifier.selectableGroup()) {
                listOf(
                    ReportReason.Cancelled to R.string.report_cancelled,
                    ReportReason.WrongTime to R.string.report_wrong_time,
                    ReportReason.WrongPrice to R.string.report_wrong_price,
                    ReportReason.WrongPlace to R.string.report_wrong_place,
                    ReportReason.Other to R.string.report_other,
                ).forEach { (r, label) ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = Tokens.Touch.MinAndroid).selectable(selected = reason == r, role = Role.RadioButton) { reason = r },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = reason == r, onClick = null)
                        Spacer(Modifier.width(Tokens.Space.S2))
                        Text(stringResource(label), style = AfishaTheme.type.body)
                    }
                }
            }
            OutlinedTextField(
                value = comment,
                onValueChange = { comment = it.take(MAX_COMMENT) },
                label = { Text(stringResource(R.string.report_comment)) },
                supportingText = { Text(stringResource(R.string.report_privacy)) },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
            if (sending) {
                BeeLoader(Modifier.align(Alignment.CenterHorizontally))
            } else {
                Button(
                    onClick = { onSend(reason, comment) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = Tokens.Touch.MinAndroid).padding(bottom = Tokens.Space.S2),
                ) { Text(stringResource(R.string.report_send)) }
            }
        }
    }
}

private const val MAX_COMMENT = 1000
