Option Explicit On
Option Strict On

Imports System
Imports System.Reflection
Imports Autodesk.Revit.DB
Imports Autodesk.Revit.UI

Namespace UI.Hub

    Partial Public Class UiBridgeExternalEvent

        Private Sub HandleSharedParamBatchRun(app As UIApplication, Optional payload As Object = Nothing)
            Dim cmdData = CreateExternalCommandData(app)
            If cmdData Is Nothing Then
                SendToWeb("host:error", New With {.message = "Shared Parameter Batch 실행 준비에 실패했습니다."})
                Return
            End If

            Dim cmd As New Global.KKY_Tool_Revit.Cmd_BatchAddSharedParameter()
            Dim message As String = ""
            Dim result As Result

            Try
                result = cmd.Execute(cmdData, message, New ElementSet())
            Catch ex As Exception
                SendToWeb("host:error", New With {.message = $"Shared Parameter Batch 실행 오류: {ex.Message}"})
                Return
            End Try

            If result <> Result.Succeeded Then
                Dim msg As String = If(String.IsNullOrWhiteSpace(message), "Shared Parameter Batch 실행이 취소되었거나 실패했습니다.", message)
                SendToWeb("host:warn", New With {.message = msg})
            End If
        End Sub

        Private Shared Function CreateExternalCommandData(app As UIApplication) As ExternalCommandData
            If app Is Nothing Then Return Nothing

            Dim t As Type = GetType(ExternalCommandData)
            Dim ctor As ConstructorInfo = Nothing
            For Each c As ConstructorInfo In t.GetConstructors(BindingFlags.Instance Or BindingFlags.NonPublic Or BindingFlags.Public)
                Dim ps = c.GetParameters()
                If ps.Length = 1 AndAlso ps(0).ParameterType Is GetType(UIApplication) Then
                    ctor = c
                    Exit For
                End If
            Next

            If ctor IsNot Nothing Then
                Return CType(ctor.Invoke(New Object() {app}), ExternalCommandData)
            End If

            Dim instance = TryCast(Activator.CreateInstance(t, True), ExternalCommandData)
            If instance Is Nothing Then Return Nothing

            Dim prop = t.GetProperty("Application", BindingFlags.Instance Or BindingFlags.Public Or BindingFlags.NonPublic)
            If prop IsNot Nothing AndAlso prop.CanWrite Then
                prop.SetValue(instance, app, Nothing)
                Return instance
            End If

            Dim field = t.GetField("m_application", BindingFlags.Instance Or BindingFlags.NonPublic)
            If field IsNot Nothing Then
                field.SetValue(instance, app)
            End If

            Return instance
        End Function

    End Class

End Namespace
